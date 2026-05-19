from PIL import Image, ImageDraw

def create_icon(size):
    s = size / 512

    def sc(v):
        return max(1, round(v * s))

    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background rounded square
    draw.rounded_rectangle(
        [0, 0, size - 1, size - 1],
        radius=sc(105),
        fill='#0F0F0F'
    )

    cal_r = max(2, sc(36))

    # Calendar body — light lower portion
    draw.rounded_rectangle(
        [sc(72), sc(128), sc(440), sc(436)],
        radius=cal_r,
        fill='#E6E6E6'
    )

    # Calendar header — dark top portion (rounded top, straight bottom)
    draw.rounded_rectangle(
        [sc(72), sc(128), sc(440), sc(285)],
        radius=cal_r,
        fill='#272727'
    )
    # Fill bottom of header to make edge straight
    draw.rectangle(
        [sc(72), sc(255), sc(440), sc(285)],
        fill='#272727'
    )

    # Tab pins (pill-shaped, sit above calendar)
    pin_r = max(1, sc(24))
    draw.rounded_rectangle(
        [sc(152), sc(72), sc(200), sc(176)],
        radius=pin_r,
        fill='#CCCCCC'
    )
    draw.rounded_rectangle(
        [sc(312), sc(72), sc(360), sc(176)],
        radius=pin_r,
        fill='#CCCCCC'
    )

    # Plus sign
    plus_color = '#888888'
    plus_r = max(1, sc(10))
    # Horizontal bar
    draw.rounded_rectangle(
        [sc(178), sc(332), sc(334), sc(378)],
        radius=plus_r,
        fill=plus_color
    )
    # Vertical bar
    draw.rounded_rectangle(
        [sc(233), sc(277), sc(279), sc(433)],
        radius=plus_r,
        fill=plus_color
    )

    return img


output_dir = 'icons'
for size in [16, 48, 128]:
    img = create_icon(size)
    path = f'{output_dir}/icon{size}.png'
    img.save(path)
    print(f'Saved {path}')
