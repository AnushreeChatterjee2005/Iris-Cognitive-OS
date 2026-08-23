import os

import pytest
from dotenv import load_dotenv


load_dotenv(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env")))


@pytest.mark.integration
def test_openai_text_response():
    if os.environ.get("IRIS_RUN_INTEGRATION_TESTS") != "1":
        pytest.skip("Set IRIS_RUN_INTEGRATION_TESTS=1 to run live API tests")

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        pytest.skip("OPENAI_API_KEY is not configured")

    from openai import OpenAI

    client = OpenAI(api_key=api_key.strip(), timeout=12.0, max_retries=1)
    response = client.responses.create(
        model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
        input="Reply with the single word: Hello",
        max_output_tokens=20,
    )
    assert response.output_text
