const prompt = `
Készíts egy gondolattérképet a következő témáról: ${topic}

A kimenet KIZÁRÓLAG érvényes Mermaid.js "mindmap" szintaxis legyen.

FONTOS SZABÁLYOK:
1. Csak "mindmap" típust használj!
2. Max 3 szint mélység (root -> ág -> levél)
3. RÖVID címkék: max 2-3 szó, max 30 karakter
4. NE használj speciális karaktereket: () / \ , ; : 
5. Csak betűk, szóközök és kötőjel (-) megengedett
6. Minden szöveget tegyél dupla idézőjelbe: "szöveg"
7. A root legyen: root(("${topic}"))
8. Az ágak legyenek: (( "ág neve" ))
9. A levelek legyenek: "levél neve"

Példa helyes szintaxisra:
mindmap
  root(("Matematika"))
    (( "Algebra" ))
      "Lineáris algebra"
      "Absztrakt algebra"
    (( "Analízis" ))
      "Valós analízis"
      "Komplex analízis"

Készíts TÖMÖR, jól strukturált gondolattérképet!`;
