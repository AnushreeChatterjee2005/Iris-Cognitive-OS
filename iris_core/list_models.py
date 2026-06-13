import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
genai.configure(api_key=os.environ.get("VITE_GEMINI_API_KEY"))

try:
    print("Available models:")
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(m.name)
except Exception as e:
    print(f"Error: {e}")
