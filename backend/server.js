const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// In-memory conversation storage (use Redis/database for production)
const conversations = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (for CSV)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Validate API key on startup
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌ ERROR: OPENAI_API_KEY not found in .env file');
  console.log('📝 Please add OPENAI_API_KEY=your_key_here to backend/.env');
  process.exit(1);
}

console.log('✅ OpenAI API key loaded from .env');

// OpenAI API Proxy endpoint with conversation history
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, conversationId, restaurantData, stream, max_tokens, temperature, model, ...otherParams } = req.body;
    
    // Generate conversation ID if not provided
    const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Get or create conversation history
    if (!conversations.has(convId)) {
      conversations.set(convId, []);
    }
    
    const conversationHistory = conversations.get(convId);
    
    // Build restaurant context from provided data
    const restaurantContext = restaurantData && restaurantData.length > 0 ? 
      restaurantData.map(r => 
        `${r.restaurant} (${r.location}): ${r.foodMenu.join(', ')} - ${r.stars}⭐ - Reviews: ${r.reviews.slice(0, 2).join('; ')}`
      ).join('\n') : '';

    console.log(`💬 Conversation ${convId}: ${conversationHistory.length} previous messages`);
    console.log(`📊 Restaurant data: ${restaurantData?.length || 0} restaurants`);
    console.log(`📝 New message: ${messages[messages.length - 1]?.content?.slice(0, 50)}...`);

    // Build system message with context
    const systemMessage = {
      role: 'system',
      content: `You are a food recommender for locals and tourists in Hanoi, Vietnam. Please answer user questions about food in an energetic, friendly and useful way.

${restaurantContext ? `Current food data:\n${restaurantContext}\n` : ''}

Response format:
- Short and concise answers.  
- Use suitable emojis.
- Give specific and as much as possible recommendations from the data.
- Include the restaurant name, address, star ratings and menus.
- If the user asks about food or restaurant not in the data, recommend similar ones from the data.
- Be friendly and response in the user language.
- Remember and reference previous conversations for the best answers`
    };

    // Build complete message history: system + conversation history + new user message
    const fullMessages = [
      systemMessage,
      ...conversationHistory,
      ...messages.filter(msg => msg.role !== 'system') // Remove any system messages from frontend
    ];

    // Prepare clean request for OpenAI (remove custom fields)
    const openaiRequest = {
      model: model || 'gpt-4o-mini',
      messages: fullMessages,
      stream: stream || false,
      max_tokens: max_tokens || 500,
      temperature: temperature || 0.7
    };

    console.log(`🚀 Sending request to OpenAI with ${fullMessages.length} messages`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(openaiRequest)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API Error:', error);
      return res.status(response.status).json({ 
        error: `OpenAI API Error: ${response.status}`,
        details: error 
      });
    }

    // Handle streaming response
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Conversation-Id', convId);
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullAssistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        res.write(chunk);

        // Collect the full response for history
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                fullAssistantMessage += content;
              } catch (e) {
                // Skip invalid JSON
              }
            }
          }
        }
      }

      // Store conversation history
      const newUserMessage = messages[messages.length - 1];
      if (newUserMessage && fullAssistantMessage) {
        conversationHistory.push(newUserMessage);
        conversationHistory.push({
          role: 'assistant',
          content: fullAssistantMessage
        });
        
        // Keep only last 10 exchanges (20 messages) to prevent token overflow
        if (conversationHistory.length > 20) {
          conversationHistory.splice(0, conversationHistory.length - 20);
        }
        
        conversations.set(convId, conversationHistory);
        console.log(`💾 Saved conversation ${convId}: ${conversationHistory.length} messages`);
      }
      
      res.end();
    } else {
      // Non-streaming response
      const data = await response.json();
      
      // Store conversation history
      const newUserMessage = messages[messages.length - 1];
      const assistantMessage = data.choices?.[0]?.message;
      
      if (newUserMessage && assistantMessage) {
        conversationHistory.push(newUserMessage);
        conversationHistory.push(assistantMessage);
        
        // Keep only last 10 exchanges
        if (conversationHistory.length > 20) {
          conversationHistory.splice(0, conversationHistory.length - 20);
        }
        
        conversations.set(convId, conversationHistory);
        console.log(`💾 Saved conversation ${convId}: ${conversationHistory.length} messages`);
      }
      
      // Return response with conversation ID
      res.json({
        ...data,
        conversationId: convId
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history endpoint
app.get('/api/conversation/:id', (req, res) => {
  const conversationId = req.params.id;
  const history = conversations.get(conversationId) || [];
  res.json({ 
    conversationId, 
    messages: history,
    messageCount: history.length 
  });
});

// Clear conversation endpoint
app.delete('/api/conversation/:id', (req, res) => {
  const conversationId = req.params.id;
  conversations.delete(conversationId);
  res.json({ success: true, message: 'Conversation cleared' });
});

// List all conversations endpoint
app.get('/api/conversations', (req, res) => {
  const convList = Array.from(conversations.keys()).map(id => ({
    id,
    messageCount: conversations.get(id).length,
    lastMessage: conversations.get(id).slice(-1)[0]?.content?.slice(0, 50) + '...' || 'Empty'
  }));
  res.json(convList);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'Backend running successfully!',
    openaiKeyLoaded: !!OPENAI_API_KEY,
    conversationsActive: conversations.size
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`🤖 OpenAI API key: ${OPENAI_API_KEY ? '✅ Loaded' : '❌ Missing'}`);
  console.log(`💬 Conversation storage: In-memory`);
});