// 1. Először próbáljuk meg a ```json ... ``` blokkot
let jsonBlock = text.match(/```json\s*([\s\S]*?)\s*```/);
if (jsonBlock && jsonBlock) {[1]
  quizData = JSON.parse(jsonBlock.trim());[1]
}

// 2. HA NEM SIKERÜLT: Keressük a LEGUTOLSÓ {} párt (nem a legelső!)
if (!quizData) {
  const lastBraceIndex = text.lastIndexOf("}");
  if (lastBraceIndex !== -1) {
    // Keressük az ehhez tartó első { jelet (helyes egyensúlytal)
    let firstBraceIndex = -1;
    let openBraces = 0;
    for (let i = lastBraceIndex; i >= 0; i--) {
      if (text[i] === "]") openBraces++;
      else if (text[i] === "[") openBraces--;
      else if (text[i] === "}") openBraces++;
      else if (text[i] === "{") {
        if (openBraces === 0) {
          firstBraceIndex = i;
          break;
        }
        openBraces--;
      }
    }
    
    if (firstBraceIndex !== -1) {
      const jsonStr = text.substring(firstBraceIndex, lastBraceIndex + 1);
      quizData = JSON.parse(jsonStr); // vagy cleanup után
    }
  }
}

// 3. Cleanup (ha mégis sikertelen):
const cleanStr = jsonStr
  .replace(/,\s*\n/g, ",\n")      // vessző után newline
  .replace(/\n\s*,/g, ",")        // newline után vessző
  .replace(/,\s*\}/g, "}")        // trailing comma a } előtt
  .replace(/,\s*\]/g, "]")        // trailing comma a [ előtt
  .trim();
quizData = JSON.parse(cleanStr);
