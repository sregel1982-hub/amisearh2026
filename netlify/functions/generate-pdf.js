export const handler = async (event) => {
  try {
    const { html, title } = JSON.parse(event.body);

    // Return the HTML content - client will render to PDF using jsPDF/print
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ 
        html: html,
        title: title || "feladat"
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
