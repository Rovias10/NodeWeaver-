import os

with open("SERVER/assets/nodeweaver-logo.svg", "r", encoding="utf-8") as f:
    svg_content = f.read()

# Replace SVG root with custom attributes
svg_start = svg_content.find("<svg")
svg_end = svg_content.find(">", svg_start) + 1
svg_inner = svg_content[svg_end:]

new_svg = """<svg class="w-full h-full drop-shadow-[0_0_8px_rgba(236,72,153,0.3)]" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">""" + svg_inner

with open("SERVER/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# Replace Object Block
target_object = """          <div class="w-10 h-10 flex items-center justify-center overflow-visible">
            <object type="image/svg+xml" data="assets/nodeweaver-logo.svg" class="w-full h-full pointer-events-none filter-none"></object>
          </div>"""

replacement_block = f"""          <div class="w-9 h-9 flex items-center justify-center overflow-visible">
            {new_svg}
          </div>"""

html = html.replace(target_object, replacement_block)

# Replace Text Margin
target_text = """<span
                class="block mt-2 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent pb-4"
              >"""
replacement_text = """<span
                class="block mt-2 bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent pb-6 -mb-4"
              >"""

html = html.replace(target_text, replacement_text)

with open("SERVER/index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("HTML patches successfully injected!")
