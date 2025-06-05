import React, { useState, useRef, useEffect } from 'react';
import { Send, Utensils, MessageCircle, Sparkles, AlertCircle, RotateCcw, History } from 'lucide-react';
import Papa from 'papaparse';
import './App.css';

const FoodChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [restaurantData, setRestaurantData] = useState([]);
  const [error, setError] = useState('');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [backendReady, setBackendReady] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Check backend health on startup
  const checkBackend = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/health');
      const data = await response.json();
      
      if (data.openaiKeyLoaded) {
        setBackendReady(true);
        setError('');
        console.log('✅ Backend ready with OpenAI API key');
      } else {
        setError('❌ OpenAI API key not found in backend .env file');
      }
    } catch (err) {
      setError('❌ Cannot connect to backend. Make sure server is running on localhost:5000');
    }
  };

  // Load CSV data from public folder
  const loadRestaurantData = async () => {
    try {
      const response = await fetch('/download.csv');
      const csvContent = await response.text();
      
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const processedData = results.data.map(row => {
            try {
              return {
                restaurant: row.Restaurant || '',
                foodType: row['Food Type'] ? JSON.parse(row['Food Type'].replace(/'/g, '"')) : [],
                foodMenu: row['Food Menu'] ? JSON.parse(row['Food Menu'].replace(/'/g, '"')) : [],
                location: row.Location || '',
                reviews: row.Reviews ? JSON.parse(row.Reviews.replace(/'/g, '"')) : [],
                stars: parseFloat(row.Stars) || 0
              };
            } catch (parseError) {
              console.warn('Error parsing row:', row, parseError);
              return {
                restaurant: row.Restaurant || '',
                foodType: row['Food Type'] ? [row['Food Type']] : [],
                foodMenu: row['Food Menu'] ? [row['Food Menu']] : [],
                location: row.Location || '',
                reviews: row.Reviews ? [row.Reviews] : [],
                stars: parseFloat(row.Stars) || 0
              };
            }
          }).filter(item => item.restaurant);
          
          setRestaurantData(processedData);
          setDataLoaded(true);
          setError('');
          console.log(`✅ Loaded ${processedData.length} restaurants successfully`);
        },
        error: (error) => {
          setError('Cannot read CSV file: ' + error.message);
        }
      });
    } catch (err) {
      setError('Cannot find download.csv. Please place it in the public folder.');
    }
  };

  useEffect(() => {
    checkBackend();
    loadRestaurantData();
  }, []);

  useEffect(() => {
    if (dataLoaded && restaurantData.length > 0 && backendReady) {
      setMessages([{
        id: 1,
        text: `Chào bạn! 🍜 Tôi là trợ lý ẩm thực AI với dữ liệu từ ${restaurantData.length} quán ăn tại Hà Nội. 

Tôi có thể nhớ cuộc trò chuyện của chúng ta để đưa ra gợi ý tốt hơn! Hãy hỏi tôi:
• "Ăn gì hôm nay?" 
• "Quán nào ngon ở khu Đống Đa?"
• "Mình vừa ăn phở rồi, gợi ý món khác?"`,
        isBot: true,
        timestamp: new Date()
      }]);
    }
  }, [dataLoaded, restaurantData, backendReady]);

  // Call backend API with conversation history
  const callOpenAI = async (userMessage) => {
    if (!backendReady) {
      setError('Backend chưa sẵn sàng. Vui lòng kiểm tra API key trong .env');
      return;
    }

    setIsTyping(true);
    setStreamingText('');
    setError('');

    try {
      console.log(`💬 Sending message with conversation ID: ${conversationId || 'new'}`);

      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: userMessage
            }
          ],
          conversationId: conversationId,
          restaurantData: restaurantData,
          stream: true,
          max_tokens: 1024,
          temperature: 0.7,
          model: 'gpt-4o-mini'
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error}`);
      }

      // Get conversation ID from response headers
      const newConversationId = response.headers.get('X-Conversation-Id');
      if (newConversationId && !conversationId) {
        setConversationId(newConversationId);
        console.log(`🆔 New conversation ID: ${newConversationId}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullResponse += content;
                setStreamingText(fullResponse);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      const botMessage = {
        id: Date.now(),
        text: fullResponse,
        isBot: true,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      setStreamingText('');
      setIsTyping(false);

      console.log(`✅ Response received, conversation history maintained`);

    } catch (err) {
      console.error('API Error:', err);
      
      let errorMessage = 'Lỗi kết nối API: ';
      
      if (err.message.includes('401')) {
        errorMessage += 'API key không hợp lệ. Kiểm tra backend/.env file';
      } else if (err.message.includes('429')) {
        errorMessage += 'Đã vượt quá giới hạn API. Vui lòng thử lại sau.';
      } else if (err.message.includes('fetch')) {
        errorMessage += 'Không thể kết nối tới backend. Đảm bảo server đang chạy ở localhost:5000';
      } else {
        errorMessage += err.message;
      }
      
      setError(errorMessage);
      setIsTyping(false);
      setStreamingText('');
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    if (!backendReady) {
      setError('Backend chưa sẵn sàng. Vui lòng kiểm tra kết nối.');
      return;
    }

    const userMessage = {
      id: Date.now(),
      text: inputValue,
      isBot: false,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputValue;
    setInputValue('');

    await callOpenAI(messageText);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearConversation = async () => {
    if (conversationId) {
      try {
        await fetch(`http://localhost:5000/api/conversation/${conversationId}`, {
          method: 'DELETE'
        });
        console.log(`🗑️ Cleared conversation ${conversationId}`);
      } catch (err) {
        console.error('Error clearing conversation:', err);
      }
    }
    
    setMessages([{
      id: Date.now(),
      text: `🔄 Cuộc trò chuyện mới bắt đầu! Tôi đã quên những gì chúng ta nói trước đó. 

Hãy hỏi tôi về món ăn, quán ngon ở Hà Nội nhé! 🍜`,
      isBot: true,
      timestamp: new Date()
    }]);
    setConversationId(null);
    setError('');
  };

  const quickSuggestions = [
    "Phở ngon ở đâu? 🍜",
    "Ăn gì hôm nay? 🤔", 
    "Pizza ở Hà Nội 🍕",
    "Quán nào gần đây? 📍",
    "Món chay có gì? 🥗",
    "Quán cà phê đẹp? ☕"
  ];

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20 p-4 shadow-lg">
        <div className="flex items-center justify-center space-x-3 relative">
          <div className="relative">
            <Utensils className="w-8 h-8 text-white" />
            <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-300 animate-pulse" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Food Assistant AI</h1>
          </div>
          {/* Clear conversation button */}
          {conversationId && (
            <button
              onClick={clearConversation}
              className="absolute right-0 bg-white/20 hover:bg-white/30 text-white p-2 rounded-xl transition-all"
              title="Bắt đầu cuộc trò chuyện mới"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="p-2 bg-white/5 border-b border-white/10">
        <div className="flex items-center justify-center space-x-4 text-xs">
          {/* <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${backendReady ? 'bg-green-400' : 'bg-red-400'}`}></div>
            <span className="text-white/70">Backend API</span>
          </div> */}
          {/* <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${dataLoaded ? 'bg-green-400' : 'bg-yellow-400'}`}></div>
            <span className="text-white/70">Restaurant Data</span>
          </div> */}
          {conversationId && (
            <div className="flex items-center space-x-1">
              <History className="w-3 h-3 text-blue-300" />
              <span className="text-blue-300">Chat History Active</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/20 border-b">
          <div className="flex items-center space-x-2 text-red-100 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
            <button
              onClick={checkBackend}
              className="ml-auto bg-red-500/30 hover:bg-red-500/50 px-2 py-1 rounded text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isBot ? 'justify-start' : 'justify-end'} animate-fadeIn`}
          >
            <div
              className="max-w-85 p-4 rounded-2xl shadow-lg"
              style={{
                backgroundColor: message.isBot ? 'white' : undefined,
                background: message.isBot ? 'white' : 'linear-gradient(to right, #3b82f6, #8b5cf6)',
                color: message.isBot ? '#1f2937' : 'white',
                borderBottomLeftRadius: message.isBot ? '0.125rem' : undefined,
                borderBottomRightRadius: message.isBot ? undefined : '0.125rem'
              }}
            >
              {message.isBot && (
                <div className="flex items-center space-x-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-semibold text-orange-500">Food Assistant</span>
                  {conversationId && (
                    <span className="text-xs text-gray-500">#{conversationId.slice(-6)}</span>
                  )}
                </div>
              )}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.text}
              </div>
              <div className="text-xs opacity-70 mt-2">
                {message.timestamp.toLocaleTimeString('vi-VN', { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {isTyping && (
          <div className="flex justify-start animate-fadeIn">
            <div className="max-w-85 p-4 rounded-2xl rounded-bl-sm bg-white text-gray-800 shadow-lg">
              <div className="flex items-center space-x-2 mb-2">
                <MessageCircle className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-semibold text-orange-500">Food Assistant</span>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {streamingText}
                <span className="animate-pulse">|</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && dataLoaded && backendReady && (
        <div className="p-4 pt-0">
          <div className="flex flex-wrap gap-2 mb-4">
            {quickSuggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="bg-white/20 backdrop-blur-sm text-white px-3 py-2 rounded-full text-sm font-medium border border-white/30 hover:bg-white/30 transition-all transform hover:scale-105"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white/10 backdrop-blur-md border-t border-white/20">
        <div className="flex space-x-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                !dataLoaded ? "Đang tải dữ liệu quán ăn..." :
                !backendReady ? "Đang kết nối backend..." :
                "Hỏi về món ăn, quán ngon... (tôi nhớ cuộc trò chuyện!)"
              }
              disabled={!dataLoaded || !backendReady}
              className="w-full p-4 pr-12 rounded-2xl border-0 bg-white/90 backdrop-blur-sm text-gray-800 focus:outline-none focus:ring-2 resize-none max-h-32 text-sm disabled:opacity-50"
              rows="1"
              style={{
                minHeight: '52px',
                height: 'auto',
                backgroundColor: 'rgba(255,255,255,0.9)',
                color: '#1f2937'
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping || !dataLoaded || !backendReady}
            className="text-white p-4 rounded-2xl transition-all transform shadow-lg disabled:opacity-50 disabled:scale-100"
            style={{
              background: (!inputValue.trim() || isTyping || !dataLoaded || !backendReady) 
                ? 'linear-gradient(to right, #9ca3af, #6b7280)' 
                : 'linear-gradient(to right, #f97316, #ec4899)',
              transform: (!inputValue.trim() || isTyping || !dataLoaded || !backendReady) ? 'scale(1)' : undefined
            }}
            onMouseEnter={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = 'linear-gradient(to right, #ea580c, #db2777)';
                e.target.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!e.target.disabled) {
                e.target.style.background = 'linear-gradient(to right, #f97316, #ec4899)';
                e.target.style.transform = 'scale(1)';
              }
            }}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        {/* <div className="text-center mt-2">
          <p className="text-white/70 text-xs">
            {dataLoaded && backendReady ? 
              `GPT-4o mini • ${restaurantData.length} quán ăn • Chat History: ${conversationId ? 'Active' : 'New'}` :
              'Đang khởi tạo hệ thống...'
            }
          </p>
        </div> */}
      </div>
    </div>
  );
};

export default FoodChatbot;