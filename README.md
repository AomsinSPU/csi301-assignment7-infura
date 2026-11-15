# Assignment 7 · Web3.js + Infura

เว็บแบบ static สำหรับ GitHub Pages เชื่อม Contract บน Sepolia:
`0x7AE51eb74CC9E7DcB20A0c5F0E878fE7f0B11340`

เปิดเว็บ กรอก Infura Sepolia HTTPS URL และ Private Key ของบัญชีทดสอบ แล้วกดเชื่อมต่อ Infura
ใช้บัญชีทดสอบที่มี Sepolia ETH สำหรับเงินฝากและค่า gas เท่านั้น
Private Key ใช้ในหน่วยความจำของเบราว์เซอร์ ไม่บันทึก localStorage และไม่ส่งให้ GitHub หรือ Infura โดยตรง ธุรกรรมถูกลงนามก่อนส่ง
กดตัดการเชื่อมต่อเมื่อใช้เสร็จ ห้ามใส่คีย์ในซอร์สหรือ commit .env

ตาม Blueprint: HttpProvider → Contract(ABI, Address) → privateKeyToAccount → wallet.add → call/send

## GitHub Pages
เผยแพร่เฉพาะ index.html, app.js, styles.css, vendor และ .nojekyll
ไฟล์ Node.js ที่เหลือเป็นเครื่องมือ Deploy และทดสอบ ไม่ต้องรันเพื่อใช้หน้าเว็บ

## ทดสอบในเครื่อง
`python -m http.server 8000 --bind 127.0.0.1`
เปิด http://127.0.0.1:8000

`npm ci` และ `npm test` สำหรับทดสอบ Contract บนเครือข่ายจำลอง
