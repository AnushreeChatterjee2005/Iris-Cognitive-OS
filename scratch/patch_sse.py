import sys

with open("C:/Users/Anushree Chatterjee/IRIS/src/App.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target = """    const connectSSE = () => {
    const handleMessage = async (event: any) => {"""

replacement = """    const connectSSE = () => {
      if (eventSource) {
        eventSource.close();
      }
      
      eventSource = new EventSource('http://127.0.0.1:8000/api/mic/events');
      
      eventSource.onopen = () => {
        console.log("Connected to Mic SSE");
      };

      const handleMessage = async (event: any) => {"""

if target in content:
    content = content.replace(target, replacement)
    
    # We also need to bind it
    target2 = """            if (isGreeting) {
              const msg = "Yes, I can hear you! How can I help?";
              playPopSound();
              setAgentMessage(msg);
              setTimeout(() => setAgentMessage(''), 4000);
              return;
            }
            if (isGreeting) {"""
            
    replacement2 = """            if (isGreeting) {
              const msg = "Yes, I can hear you! How can I help?";
              playPopSound();
              setAgentMessage(msg);
              setTimeout(() => setAgentMessage(''), 4000);
              return;
            }"""
            
    content = content.replace(target2, replacement2)
    
    # Now bind the event handler
    target3 = """          }
        } catch (error) {
          console.error("Error parsing mic SSE data:", error);
        }
      };"""
      
    replacement3 = """          }
        } catch (error) {
          console.error("Error parsing mic SSE data:", error);
        }
      };
      
      eventSource.onmessage = handleMessage;
      (window as any).mockSSEHandler = handleMessage;"""
      
    content = content.replace(target3, replacement3)
    
    with open("C:/Users/Anushree Chatterjee/IRIS/src/App.tsx", "w", encoding="utf-8") as f:
        f.write(content)
    print("PATCHED")
else:
    print("TARGET NOT FOUND")
