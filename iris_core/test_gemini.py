import google.generativeai as genai
import sys

try:
    genai.configure(api_key="AQ.Ab8RN6LzEPJnTWzG21u7fh-s1kKGTzxE0JYNzg1Aicox2Ck5jQ")
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Hello")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
