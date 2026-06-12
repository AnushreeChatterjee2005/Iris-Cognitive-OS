import requests

prompt = """You are an expert data extraction agent.
The user's intent is: "extract and fill"

Here is the unstructured text from the SOURCE:
Alexander Wright awright dev@example com (555) 123-4567 San Francisco, CA EDUCATION Stanford University 2018 2022 Bachelor of Science in Computer Science Specialization in Artificial Intelligence and Human-Computer Interaction. GPA: 3.9/4.0. EXPERIENCE Frontend Engineer 2022 Present TechFlow Inc: Spearheaded the development of the main dashboard using React and TypeScript: Improved rendering performance by 40% through virtualization and memoization. Collaborated with UX team to redesign the core application workflow: SKILLS JavaScript, TypeScript; React; Nodejs, Python, CSS, HTML, Webpack, Git; Figma, Agile Methodologies: and

Here are the input field labels found in the TARGET form (in order):
First Name Last Name e.g: Jane e.g: Doe Email Address Phone Number name@domain.com (555) 0oo-0ooo University College Institution Name Highest Degree Earned e.g. B.S. Computer Science Most Recent Company Company Name Most Recent Role Extracting via Gemini Job Title extract and fill

Map the source data to these target fields. 
Return EXACTLY AND ONLY a valid JSON array of strings containing the values in the exact order of the target fields.
If a field has no matching data in the source, use an empty string "" for that value.
Do not wrap it in markdown block quotes. Just the raw JSON array.
Example output: ["Alexander Wright", "awright.dev@example.com", "Stanford University"]
"""

API_BASE_URL = "https://api.cloudflare.com/client/v4/accounts/895f8c7b633eccf9438f9c233b93049b/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast"
headers = {"Authorization": "Bearer cfut_2KqZpUwpIsNcHK4jkgrc7mH6PuKSaubdYhD2Rmad50d12dbc"}
inputs = {
    "max_tokens": 1000,
    "messages": [
    {"role": "system", "content": "You are a rigid data mapping API. You ONLY output valid JSON arrays like [\"val1\", \"val2\"]. Never output plain text."},
    {"role": "user", "content": prompt + "\n\nRespond with the JSON array now:"}
    ]
}
response = requests.post(API_BASE_URL, headers=headers, json=inputs)
print(response.json())
