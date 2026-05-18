import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add KaTeX and Marked to head
head_addition = """
<!-- KaTeX & Marked -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
"""
content = content.replace('</head>', head_addition + '</head>')

# 2. Hero Section: Replace avatars/rating with dashboard
hero_original = """        <div class="flex items-center space-x-6 pt-4">
          <div class="flex -space-x-2">
            <img src="https://i.pravatar.cc/100?img=1" class="w-10 h-10 rounded-full border-2 border-white" alt="user">
            <img src="https://i.pravatar.cc/100?img=5" class="w-10 h-10 rounded-full border-2 border-white" alt="user">
            <img src="https://i.pravatar.cc/100?img=8" class="w-10 h-10 rounded-full border-2 border-white" alt="user">
            <img src="https://i.pravatar.cc/100?img=12" class="w-10 h-10 rounded-full border-2 border-white" alt="user">
          </div>
          <div>
            <div class="flex items-center text-yellow-500">
              <i class="fa-solid fa-star"></i>
              <i class="fa-solid fa-star"></i>
              <i class="fa-solid fa-star"></i>
              <i class="fa-solid fa-star"></i>
              <i class="fa-solid fa-star"></i>
              <span class="ml-2 text-gray-900 font-bold">4.9/5</span>
            </div>
            <p class="text-sm text-gray-600" data-hu="Megbízható oktatási eszköz" data-en="Trusted learning tool">Megbízható oktatási eszköz</p>
          </div>
        </div>"""

hero_new = """        <div id="heroDashboard" class="hidden pt-4 w-full max-w-sm">
          <details class="group bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden cursor-pointer">
            <summary class="flex items-center justify-between p-4 list-none outline-none">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 bg-gradient-to-br from-[#6C5CE7] to-[#A29BFE] rounded-full flex items-center justify-center text-white font-bold" id="dashAvatar">U</div>
                <div>
                  <div class="font-bold text-gray-900 flex items-center space-x-2">
                    <span id="dashName">User</span>
                    <span id="dashStatus" class="px-2 py-0.5 bg-purple-100 text-[#6C5CE7] rounded-full text-xs font-bold">Diák</span>
                  </div>
                </div>
              </div>
              <i class="fa-solid fa-chevron-down text-gray-400 group-open:rotate-180 transition-transform"></i>
            </summary>
            <div class="p-4 border-t border-gray-50 bg-gray-50/50">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm text-gray-600" data-hu="Közösségi pont:" data-en="Community points:">Közösségi pont:</span>
                <span class="font-bold text-gray-900" id="dashPoints">0</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600" data-hu="Előfizetés:" data-en="Subscription:">Előfizetés:</span>
                <span class="font-bold text-[#6C5CE7]" id="dashSub">Free</span>
              </div>
            </div>
          </details>
        </div>"""

if hero_original in content:
    content = content.replace(hero_original, hero_new)
else:
    print("WARNING: hero_original not found")

# 3. Footer Date
content = content.replace('&copy; 2024 AMISEARCH.', '&copy; 2026 AMISEARCH.')

# 4. "Rólunk" Icons
rolunk_original = """    <div class="grid md:grid-cols-3 gap-8 text-center">
      <div class="p-8">
        <div class="text-5xl font-extrabold gradient-text mb-2">50+</div>
        <p class="text-gray-600 font-medium" data-hu="Egyetem" data-en="Universities">Egyetem</p>
      </div>
      <div class="p-8">
        <div class="text-5xl font-extrabold gradient-text mb-2">98%</div>
        <p class="text-gray-600 font-medium" data-hu="Elégedettség" data-en="Satisfaction">Elégedettség</p>
      </div>
      <div class="p-8">
        <div class="text-5xl font-extrabold gradient-text mb-2">24/7</div>
        <p class="text-gray-600 font-medium" data-hu="AI Támogatás" data-en="AI Support">AI Támogatás</p>
      </div>
    </div>"""

rolunk_new = """    <div class="grid md:grid-cols-3 gap-8 text-center">
      <div class="p-8 flex justify-center items-center">
        <i class="fa-solid fa-graduation-cap text-6xl text-[#6C5CE7] float-animation"></i>
      </div>
      <div class="p-8 flex justify-center items-center">
        <i class="fa-solid fa-book text-6xl text-[#6C5CE7] float-animation" style="animation-delay: 0.5s"></i>
      </div>
      <div class="p-8 flex justify-center items-center">
        <i class="fa-solid fa-pencil text-6xl text-[#6C5CE7] float-animation" style="animation-delay: 1s"></i>
      </div>
    </div>"""

if rolunk_original in content:
    content = content.replace(rolunk_original, rolunk_new)
else:
    print("WARNING: rolunk_original not found")

# 5. Auth UI Update
auth_ui_orig = """    if (user) {
      loginBtn.classList.add('hidden');
      registerBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      greeting.classList.remove('hidden');
      greeting.textContent = user.user_metadata?.full_name || user.email;
    } else {
      loginBtn.classList.remove('hidden');
      registerBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      greeting.classList.add('hidden');
      greeting.textContent = '';
    }"""

auth_ui_new = """    const heroDashboard = document.getElementById('heroDashboard');
    if (user) {
      loginBtn.classList.add('hidden');
      registerBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      greeting.classList.remove('hidden');
      const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
      greeting.textContent = displayName;
      
      if (heroDashboard) {
        heroDashboard.classList.remove('hidden');
        document.getElementById('dashName').textContent = displayName;
        document.getElementById('dashAvatar').textContent = displayName.charAt(0).toUpperCase();
        // Fallbacks since no complex DB logic
        document.getElementById('dashStatus').textContent = user.user_metadata?.role === 'teacher' ? 'Tanár' : 'Diák';
        document.getElementById('dashPoints').textContent = user.user_metadata?.points || '0';
        document.getElementById('dashSub').textContent = user.user_metadata?.plan || 'Free';
      }
    } else {
      loginBtn.classList.remove('hidden');
      registerBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      greeting.classList.add('hidden');
      greeting.textContent = '';
      if (heroDashboard) heroDashboard.classList.add('hidden');
    }"""

if auth_ui_orig in content:
    content = content.replace(auth_ui_orig, auth_ui_new)
else:
    print("WARNING: auth_ui_orig not found")

# 6. Chat & Search Render updates
# For Chat:
chat_render_orig_1 = """        fullText += decoder.decode(value, { stream: true });
        target.textContent = fullText;"""
chat_render_new_1 = """        fullText += decoder.decode(value, { stream: true });
        target.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : escapeHtml(fullText);"""
if chat_render_orig_1 in content:
    content = content.replace(chat_render_orig_1, chat_render_new_1)
else:
    print("WARNING: chat_render_orig_1 not found")

chat_render_orig_2 = """      window.chatHistory.push({ role: 'assistant', content: fullText });
    } catch (err) {"""
chat_render_new_2 = """      window.chatHistory.push({ role: 'assistant', content: fullText });
      if (window.renderMathInElement) {
        renderMathInElement(target, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}, {left: '\\\\[', right: '\\\\]', display: true}, {left: '\\\\(', right: '\\\\)', display: false}], throwOnError: false });
      }
    } catch (err) {"""
if chat_render_orig_2 in content:
    content = content.replace(chat_render_orig_2, chat_render_new_2)
else:
    print("WARNING: chat_render_orig_2 not found")


# For Search (wait, we need to see how search streaming is implemented):
search_render_orig_1 = """        fullText += decoder.decode(value, { stream: true });
        results.textContent = fullText;"""
search_render_new_1 = """        fullText += decoder.decode(value, { stream: true });
        results.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : escapeHtml(fullText);"""
if search_render_orig_1 in content:
    content = content.replace(search_render_orig_1, search_render_new_1)
else:
    print("WARNING: search_render_orig_1 not found")

search_render_orig_2 = """      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        results.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : escapeHtml(fullText);
      }
    } catch (err) {"""
search_render_new_2 = """      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        results.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : escapeHtml(fullText);
      }
      if (window.renderMathInElement) {
        renderMathInElement(results, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}, {left: '\\\\[', right: '\\\\]', display: true}, {left: '\\\\(', right: '\\\\)', display: false}], throwOnError: false });
      }
    } catch (err) {"""

if search_render_orig_2 in content:
    content = content.replace(search_render_orig_2, search_render_new_2)
else:
    print("WARNING: search_render_orig_2 not found")

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patching done!")
