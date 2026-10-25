import fitz

doc = fitz.open('/home/z/my-project/upload/page0001.pdf')
page = doc[0]
print('page rect:', page.rect)
words = page.get_text('words')  # x0,y0,x1,y1,word,block,line,word_no
# sort by y then x
words.sort(key=lambda w: (round(w[1], 1), w[0]))
for w in words:
    x0, y0, x1, y1, t = w[0], w[1], w[2], w[3], w[4]
    print(f"({x0:6.1f},{y0:6.1f})-({x1:6.1f},{y1:6.1f}) {t}")
