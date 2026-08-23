import os

from dotenv import load_dotenv
from openai import OpenAI


load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise SystemExit("OPENAI_API_KEY is not configured.")

client = OpenAI(api_key=api_key.strip())
for model in sorted(client.models.list().data, key=lambda item: item.id):
    print(model.id)
