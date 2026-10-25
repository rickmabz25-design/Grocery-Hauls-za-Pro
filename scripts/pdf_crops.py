import fitz

doc = fitz.open('/home/z/my-project/upload/page0001.pdf')
page = doc[0]
crops = {
    'sidebar_top': fitz.Rect(590, 280, 751, 480),    # tomatoes combo, carrots
    'sidebar_bot': fitz.Rect(590, 460, 751, 670),    # potatoes, onions, butternut
    'row1_meat':   fitz.Rect(0, 270, 600, 470),      # russians, beef, boerewors, pork
    'row2':        fitz.Rect(0, 460, 600, 670),      # IQF, wings, ground beef, hake
    'row3':        fitz.Rect(100, 655, 751, 860),    # GO bucket, sizzler, cake, queens
    'row4_left':   fitz.Rect(0, 840, 300, 1062),     # maas, bread
    'row4_right':  fitz.Rect(270, 840, 751, 1062),   # jam combo, polony, eggs
}
for name, clip in crops.items():
    pix = page.get_pixmap(matrix=fitz.Matrix(3.2, 3.2), clip=clip)
    pix.save(f'/home/z/my-project/scripts/crop_{name}.png')
    print(name, pix.width, pix.height)
