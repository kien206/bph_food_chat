# Food Chatbot App

This project is a full-stack AI-powered food recommendation chatbot for locals and tourists in Hanoi, Vietnam. It consists of a backend (Node.js/Express) and a frontend (React) that work together to provide food and restaurant suggestions based on a CSV dataset.

## Features
- AI chatbot powered by OpenAI (GPT-4o-mini by default)
- Uses real restaurant data from a CSV file
- Remembers conversation history for better recommendations
- Friendly, emoji-rich responses

---

## Prerequisites
- [Node.js](https://nodejs.org/) (v16 or newer recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)
- An OpenAI API key ([get one here](https://platform.openai.com/account/api-keys))

---

## 1. Clone the Repository
```bash
git clone <your-repo-url>
cd food_chat
```

---

## 2. Backend Setup
1. Go to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` folder and add your OpenAI API key:
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   ```
4. Start the backend server:
   ```bash
   npm start
   ```
   The backend will run on [http://localhost:5000](http://localhost:5000)

---

## 3. Frontend Setup
1. Open a new terminal and go to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Make sure `download.csv` is in the `frontend/public` folder (already included).
4. Start the frontend app:
   ```bash
   npm start
   ```
   The frontend will run on [http://localhost:3000](http://localhost:3000)

---

## 4. Usage
- Open [http://localhost:3000](http://localhost:3000) in your browser.
- Start chatting with the AI food assistant!

---

## Troubleshooting
- **Backend not connecting?**
  - Make sure the backend is running and `.env` contains a valid OpenAI API key.
- **CSV not loading?**
  - Ensure `download.csv` is present in `frontend/public`.
- **Port conflicts?**
  - Change the ports in the scripts or use environment variables as needed.

---

## Project Structure
```
food_chat/
  backend/      # Node.js Express backend
  frontend/     # React frontend
    public/
      download.csv  # Restaurant data
```

---

## License
MIT License
