// ai-pdf-export.js FINAL V2
(function(){
  function getText(bubble){
    const c=bubble.cloneNode(true);
    c.querySelectorAll('[data-ai-dl-toolbar],button').forEach(e=>e.remove());
    return c.innerText||'';
  }
  window.downloadAiAnswerPdf=async function(btn){
    const bubble=btn.closest('.ai-message,.chat-message,.message,[data-ai-bubble]');
    if(!bubble) return alert('Nem található válasz');
    const {jsPDF}=window.jspdf||{}; if(!jsPDF) return alert('jsPDF hiányzik');

    const pdf=new jsPDF({unit:'pt',format:'a4'});
    const W=pdf.internal.pageSize.getWidth(), H=pdf.internal.pageSize.getHeight(), M=48, maxW=W-M*2;
    let y=M;

    pdf.setFont('helvetica','bold'); pdf.setFontSize(16); pdf.setTextColor(108,92,231);
    pdf.text('AMISEARCH — AI válasz',M,y); y+=20;
    pdf.setFont('helvetica','normal'); pdf.setFontSize(9); pdf.setTextColor(100);
    pdf.text(new Date().toLocaleString('hu-HU'),M,y); y+=30;
    pdf.setFontSize(11); pdf.setTextColor(30);

    const lines=pdf.splitTextToSize(getText(bubble).normalize('NFC'), maxW);
    for(let l of lines){
      if(y>H-60){pdf.addPage(); y=M;}
      // **-ok kiszedése
      l=l.replace(/\*\*(.+?)\*\*/g,'$1');
      pdf.text(l,M,y); y+=14;
    }
    pdf.save('amisearch-'+Date.now()+'.pdf');
  };
})();
