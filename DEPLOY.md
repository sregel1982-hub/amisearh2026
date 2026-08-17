Teacher Hub — Deploy & setup

This project includes Netlify serverless functions that rely on a Supabase backend.

What I added
- /.netlify/functions/user-profile.js
- /.netlify/functions/classes.js
- /.netlify/functions/notes.js
- /.netlify/functions/download-my-note.js
- migrations/0001_create_classes.sql

Required environment variables (set these in Netlify dashboard for your site):
- SUPABASE_URL = https://rvgzvseejzbzmcqidnzc.supabase.co
- SUPABASE_SERVICE_ROLE_KEY = <your supabase service_role key>

Important security note
- Do NOT commit or share your service_role key in source control. Set it only as an environment variable in Netlify.

Database migration
1. Open your Supabase project.
2. Go to the SQL editor and run the SQL in migrations/0001_create_classes.sql to create the classes table.

Netlify deployment
- The functions are standard Netlify Functions under /.netlify/functions/. When you deploy the site on Netlify the functions will be available at /.netlify/functions/<name>.

Frontend integration
- The existing frontend (teacher-hub.html) already calls these endpoints: /.netlify/functions/user-profile, /.netlify/functions/classes, /.netlify/functions/notes, /.netlify/functions/download-my-note
- Once the environment variables and migration are in place, the frontend should work with the real backend.

Testing locally
- You can test the functions locally with Netlify CLI (netlify dev). Remember to provide the environment variables locally (e.g., via a .env file or your shell).

If you want, I can now open a PR or commit these files directly to main — you previously asked to commit to main, so I pushed them there. After you set the SUPABASE_SERVICE_ROLE_KEY in Netlify and run the SQL migration, test the teacher hub by logging in and visiting teacher-hub.html.
