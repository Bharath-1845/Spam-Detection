import os
from fpdf import FPDF
from datetime import datetime

class ClassificationReportPDF(FPDF):
    def header(self):
        # Premium dark bar at the top
        self.set_fill_color(15, 23, 42) # Obsidian slate (matches Midnight Glassmorphic)
        self.rect(0, 0, 210, 28, 'F')
        
        # Title text in white
        self.set_text_color(255, 255, 255)
        self.set_font("Helvetica", "B", 16)
        self.cell(0, 10, "INTELLIGENT EMAIL CLASSIFICATION SYSTEM", ln=True, align="C")
        
        self.set_font("Helvetica", "I", 9)
        self.cell(0, 5, "Automated Security Analysis & Ham/Spam Breakdown", ln=True, align="C")
        self.ln(10)

    def footer(self):
        # Position at 1.5 cm from bottom
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(148, 163, 184) # Soft slate
        
        # Line above footer
        self.set_draw_color(226, 232, 240)
        self.line(10, self.get_y() - 2, 200, self.get_y() - 2)
        
        # Footer text
        self.cell(0, 10, f"System Report Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}  |  Page {self.page_no()}/{{nb}}", align="C")

def generate_report_pdf(results, summary):
    pdf = ClassificationReportPDF()
    pdf.alias_nb_pages()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)
    
    # Body Title
    pdf.ln(10)
    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "Session Summary & Metrics", ln=True)
    pdf.ln(2)
    
    # Metadata Cards (Draw borders for stats)
    # Total, Spam, Ham, Accuracy
    pdf.set_fill_color(248, 250, 252) # Soft gray-blue background
    pdf.set_draw_color(203, 213, 225)
    pdf.rect(10, 48, 190, 32, 'DF')
    
    # Add text inside metadata box
    pdf.set_text_color(71, 85, 105)
    pdf.set_font("Helvetica", "", 10)
    pdf.text(15, 55, f"Total Analyzed Emails: {summary['total']}")
    pdf.text(15, 62, f"Spam Classified: {summary['spam']} ({summary['spam_pct']:.1f}%)")
    pdf.text(15, 69, f"Ham Classified: {summary['ham']} ({summary['ham_pct']:.1f}%)")
    
    pdf.text(110, 55, f"Avg Spam Confidence: {summary['avg_spam_conf']:.1f}%")
    pdf.text(110, 62, f"Avg Ham Confidence: {summary['avg_ham_conf']:.1f}%")
    pdf.text(110, 69, f"System Status: ONLINE & ACTIVE")
    
    # Draw a visual distribution bar inside the PDF
    pdf.ln(36)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 6, "Ham / Spam Ratio:", ln=True)
    pdf.ln(1)
    
    total = summary['total']
    if total > 0:
        spam_ratio = summary['spam'] / total
        ham_ratio = summary['ham'] / total
        
        # Width of bar is 190mm
        spam_width = 190 * spam_ratio
        ham_width = 190 * ham_ratio
        
        x = 10
        y = pdf.get_y()
        
        # Draw Ham bar (Sapphire Blue - matching design theme)
        if ham_width > 0:
            pdf.set_fill_color(37, 99, 235) # Sapphire blue
            pdf.rect(x, y, ham_width, 6, 'F')
            x += ham_width
            
        # Draw Spam bar (Crimson Red)
        if spam_width > 0:
            pdf.set_fill_color(225, 29, 72) # Crimson red
            pdf.rect(x, y, spam_width, 6, 'F')
            
        pdf.ln(8)
        # Legend
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(37, 99, 235)
        pdf.cell(40, 5, f" Ham: {summary['ham']} ({summary['ham_pct']:.1f}%)", align="L")
        pdf.set_text_color(225, 29, 72)
        pdf.cell(40, 5, f" Spam: {summary['spam']} ({summary['spam_pct']:.1f}%)", align="L")
    else:
        pdf.set_font("Helvetica", "I", 9)
        pdf.cell(0, 5, "No data available in this session.", ln=True)
        pdf.ln(8)
        
    pdf.ln(10)
    
    # Table of results
    pdf.set_text_color(30, 41, 59)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, "Detailed Classifications", ln=True)
    pdf.ln(2)
    
    # Table Header
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(15, 23, 42) # slate-900
    pdf.set_text_color(255, 255, 255)
    pdf.set_draw_color(30, 41, 59)
    
    # Column Widths
    # Total = 190
    col_widths = [15, 80, 50, 20, 25] # ID, Subject, Sender, Result, Confidence
    headers = ["ID", "Subject", "Sender", "Result", "Confidence"]
    
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 8, header, border=1, ln=(i == len(headers) - 1), fill=True, align="C")
        
    # Table Body
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(30, 41, 59)
    
    for idx, item in enumerate(results):
        # Alternating background colors
        if idx % 2 == 0:
            pdf.set_fill_color(248, 250, 252) # Slate-50
        else:
            pdf.set_fill_color(255, 255, 255) # White
            
        subj = item.get("subject", "(No Subject)")
        sender = item.get("sender", "(No Sender)")
        prediction = item.get("prediction", "ham").upper()
        confidence = f"{item.get('confidence', 0.0) * 100:.1f}%"
        
        # Clean long strings
        if len(subj) > 42:
            subj = subj[:39] + "..."
        if len(sender) > 28:
            sender = sender[:25] + "..."
            
        # Draw cells
        pdf.cell(col_widths[0], 7, str(idx + 1), border=1, fill=True, align="C")
        pdf.cell(col_widths[1], 7, subj, border=1, fill=True)
        pdf.cell(col_widths[2], 7, sender, border=1, fill=True)
        
        # Highlight prediction color
        if prediction == "SPAM":
            pdf.set_text_color(225, 29, 72) # Crimson
            pdf.set_font("Helvetica", "B", 8)
        else:
            pdf.set_text_color(37, 99, 235) # Sapphire
            pdf.set_font("Helvetica", "B", 8)
            
        pdf.cell(col_widths[3], 7, prediction, border=1, fill=True, align="C")
        
        pdf.set_text_color(30, 41, 59) # Reset color
        pdf.set_font("Helvetica", "", 8)
        pdf.cell(col_widths[4], 7, confidence, border=1, fill=True, align="C", ln=True)
        
    return pdf.output()
