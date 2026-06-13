import google.generativeai as genai
import sys

import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    genai.configure(api_key=os.environ.get("VITE_GEMINI_API_KEY"))
    model = genai.GenerativeModel('gemini-2.5-flash')
    response = model.generate_content("Hello")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
