import google.generativeai as genai
genai.configure(api_key="AQ.Ab8RN6LzEPJnTWzG21u7fh-s1kKGTzxE0JYNzg1Aicox2Ck5jQ")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(m.name)
