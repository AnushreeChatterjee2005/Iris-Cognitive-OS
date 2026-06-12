import easyocr
import numpy as np

print("Loading reader...")
reader = easyocr.Reader(['en'], gpu=False)

print("Creating dummy image...")
# Create a blank 500x500 image with text? Just use random noise to see if it crashes PyTorch
img = np.random.randint(0, 255, (500, 500, 3), dtype=np.uint8)

print("Extracting text...")
try:
    results = reader.readtext(img, detail=0)
    print("Results:", results)
except Exception as e:
    print("Crash:", e)

print("Done")
