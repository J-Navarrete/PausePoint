# 🛡️ PausePoint

An AI-powered digital intervention tool designed to instantly shatter doomscrolling habits and rewire procrastination loops in real-time. Built in Python using **Streamlit** and **Gemini 2.5 Flash**.

## 🚀 How It Works
Instead of relying on rigid app-blockers that users routinely bypass, **PausePoint** introduces psychological friction at the exact moment of interception. When a user tries to access a distraction, the app halts them, logs the negative emotion driving their procrastination (boredom, anxiety, burnout), and uses Gemini AI to instantly generate a laughably small, 2-minute micro-step to kickstart their focus.

## 🛠️ Installation & Setup

Follow these simple steps to install and run PausePoint locally on your machine:

### 1. Clone the Repository
```bash
git clone [https://github.com/USERNAME/pausepoint.git](https://github.com/USERNAME/pausepoint.git)
cd pausepoint

```

### 2. Install Dependencies

Make sure you have Python installed, then run:

```bash
pip install -r requirements.txt

```

### 3. Set Up Your Gemini API Key

Get a free API key from [Google AI Studio](https://aistudio.google.com/). Set it in your terminal environment:

* **On macOS/Linux:**
```bash
export GEMINI_API_KEY="your_actual_api_key_here"

```

* **On Windows (Command Prompt):**
```bash
set GEMINI_API_KEY="your_actual_api_key_here"

```

* **On Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="your_actual_api_key_here"

```

### 4. Run the Application

Launch the Streamlit server:

```bash
streamlit run app.py

```
Your browser will automatically open up to `http://localhost:8501`.
