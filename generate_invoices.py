import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def create_invoice(filename, invoice_num, company, amount):
    c = canvas.Canvas(filename, pagesize=letter)
    
    # Header
    c.setFont("Helvetica-Bold", 24)
    c.drawString(50, 750, "INVOICE")
    
    # Details
    c.setFont("Helvetica", 12)
    c.drawString(50, 710, f"Invoice #: {invoice_num}")
    c.drawString(50, 690, f"Date: 2026-08-18")
    
    c.drawString(50, 650, "Billed To:")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, 630, company)
    c.setFont("Helvetica", 12)
    c.drawString(50, 610, "123 Business Rd, Suite 100")
    
    # Line Items
    c.line(50, 580, 550, 580)
    c.drawString(50, 560, "Description")
    c.drawString(450, 560, "Amount")
    c.line(50, 550, 550, 550)
    
    c.drawString(50, 530, "Software Consulting Services")
    c.drawString(450, 530, f"${amount - 50:.2f}")
    
    c.drawString(50, 510, "Server Maintenance")
    c.drawString(450, 510, "$50.00")
    
    c.line(50, 490, 550, 490)
    
    # Total
    c.setFont("Helvetica-Bold", 14)
    c.drawString(350, 460, "Total Amount Due:")
    c.drawString(450, 460, f"${amount:.2f}")
    
    c.save()

os.makedirs("demo_invoices", exist_ok=True)

invoices = [
    ("demo_invoices/INV-001_AcmeCorp.pdf", "INV-001", "Acme Corporation", 1250.00),
    ("demo_invoices/INV-002_Globex.pdf", "INV-002", "Globex Inc", 840.50),
    ("demo_invoices/INV-003_Initech.pdf", "INV-003", "Initech LLC", 2100.75),
]

for filename, inv_num, company, amount in invoices:
    create_invoice(filename, inv_num, company, amount)
    print(f"Created {filename}")
