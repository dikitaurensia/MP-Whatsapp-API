const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

const client = new Client({
  authStrategy: new LocalAuth(),
});

let latestQRCode = "";
const carts = {}; // Menyimpan pesanan per user

const products = [
  { id: 1, name: "Kaos Polos", price: 50000 },
  { id: 2, name: "Celana Jeans", price: 150000 },
  { id: 3, name: "Jaket Hoodie", price: 200000 },
];

client.on("qr", (qr) => {
  latestQRCode = qr;
  console.log("New QR Code generated!");
});

client.on("ready", () => {
  console.log("Client is ready!");
  latestQRCode = ""; // Clear QR code when logged in
});

client.on("auth_failure", (message) => {
  console.log("Authentication failed:", message);
});

client.on("authenticated", (session) => {
  console.log("Authenticated", session);
});

client.on("disconnected", (reason) => {
  console.log("Disconnected", reason);
});

app.get("/qr", (req, res) => {
  if (!latestQRCode) {
    return res.json({ qr: "" });
  }
  qrcode.toDataURL(latestQRCode, (err, url) => {
    if (err) {
      return res.status(500).json({ error: "QR code generation failed" });
    }
    res.json({ qr: url }); // Send QR as a base64 image
  });
});

client.on("message", async (message) => {
  const userId = message.from;

  if (message.body.toLowerCase() === "menu") {
    let menuText = "📌 *Daftar Produk*\n\n";
    products.forEach((p) => {
      menuText += `🔹 ${p.id}. ${p.name} - Rp ${p.price.toLocaleString()}\n`;
    });
    menuText += "\nKetik *BELI [nomor_produk] [jumlah]* untuk order.";
    client.sendMessage(userId, menuText);
  } else if (message.body.toLowerCase().startsWith("beli")) {
    const parts = message.body.split(" ");
    if (parts.length < 3) {
      return client.sendMessage(
        userId,
        "Format salah! Gunakan: *BELI [nomor_produk] [jumlah]*"
      );
    }

    const productId = parseInt(parts[1]);
    const quantity = parseInt(parts[2]);
    const product = products.find((p) => p.id === productId);

    if (!product) {
      return client.sendMessage(userId, "Produk tidak ditemukan!");
    }

    if (!carts[userId]) {
      carts[userId] = [];
    }

    const existingProduct = carts[userId].find((item) => item.id === productId);
    if (existingProduct) {
      existingProduct.quantity += quantity;
    } else {
      carts[userId].push({
        id: productId,
        name: product.name,
        price: product.price,
        quantity,
      });
    }

    client.sendMessage(
      userId,
      `✅ ${product.name} x${quantity} telah ditambahkan ke keranjang.`
    );
    client.sendMessage(userId, "Ketik *KERANJANG* untuk melihat pesanan.");
  } else if (message.body.toLowerCase() === "keranjang") {
    if (!carts[userId] || carts[userId].length === 0) {
      return client.sendMessage(
        userId,
        "🛒 Keranjang Anda kosong. Ketik *MENU* untuk melihat produk."
      );
    }

    let cartText = "🛒 *Keranjang Anda:*\n\n";
    let totalPrice = 0;

    carts[userId].forEach((item, index) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;
      cartText += `${index + 1}. ${item.name} x${
        item.quantity
      } - Rp ${itemTotal.toLocaleString()}\n`;
    });

    cartText += `\n💰 *Total: Rp ${totalPrice.toLocaleString()}*\n`;
    cartText += "Ketik *UBAH [nomor_item] [jumlah_baru]* untuk edit,\n";
    cartText += "Ketik *HAPUS [nomor_item]* untuk hapus satu produk,\n";
    cartText += "Ketik *HAPUS KERANJANG* untuk menghapus semua.\n";
    cartText += "Ketik *CHECKOUT* untuk lanjut.";

    client.sendMessage(userId, cartText);
  } else if (message.body.toLowerCase().startsWith("ubah")) {
    const parts = message.body.split(" ");
    if (parts.length < 3) {
      return client.sendMessage(
        userId,
        "Format salah! Gunakan: *UBAH [nomor_item] [jumlah_baru]*"
      );
    }

    const itemIndex = parseInt(parts[1]) - 1;
    const newQuantity = parseInt(parts[2]);

    if (!carts[userId] || itemIndex < 0 || itemIndex >= carts[userId].length) {
      return client.sendMessage(userId, "Item tidak ditemukan di keranjang.");
    }

    if (newQuantity === 0) {
      carts[userId].splice(itemIndex, 1);
      client.sendMessage(userId, "Produk telah dihapus dari keranjang.");
    } else {
      carts[userId][itemIndex].quantity = newQuantity;
      client.sendMessage(
        userId,
        `✅ ${carts[userId][itemIndex].name} telah diperbarui menjadi x${newQuantity}.`
      );
    }

    client.sendMessage(userId, "Ketik *KERANJANG* untuk melihat pesanan.");
  } else if (message.body.toLowerCase().startsWith("hapus ")) {
    const parts = message.body.split(" ");
    if (parts.length < 2) {
      return client.sendMessage(
        userId,
        "Format salah! Gunakan: *HAPUS [nomor_item]*"
      );
    }

    const itemIndex = parseInt(parts[1]) - 1;

    if (!carts[userId] || itemIndex < 0 || itemIndex >= carts[userId].length) {
      return client.sendMessage(userId, "Item tidak ditemukan di keranjang.");
    }

    const removedItem = carts[userId].splice(itemIndex, 1);
    client.sendMessage(
      userId,
      `🗑 ${removedItem[0].name} telah dihapus dari keranjang.`
    );
    client.sendMessage(userId, "Ketik *KERANJANG* untuk melihat pesanan.");
  } else if (message.body.toLowerCase() === "hapus keranjang") {
    if (!carts[userId] || carts[userId].length === 0) {
      return client.sendMessage(userId, "🛒 Keranjang Anda sudah kosong.");
    }

    client.sendMessage(
      userId,
      "⚠️ Anda yakin ingin menghapus semua isi keranjang? Ketik *YA* untuk konfirmasi."
    );
    carts[userId].confirmDelete = true;
  } else if (
    message.body.toLowerCase() === "ya" &&
    carts[userId]?.confirmDelete
  ) {
    delete carts[userId];
    client.sendMessage(userId, "✅ Keranjang Anda telah dikosongkan.");
  } else if (message.body.toLowerCase() === "checkout") {
    if (!carts[userId] || carts[userId].length === 0) {
      return client.sendMessage(userId, "🛒 Keranjang Anda kosong.");
    }

    let totalPrice = 0;
    let checkoutText = "🛍 *Pesanan Anda:*\n\n";

    carts[userId].forEach((item) => {
      const itemTotal = item.price * item.quantity;
      totalPrice += itemTotal;
      checkoutText += `✅ ${item.name} x${
        item.quantity
      } - Rp ${itemTotal.toLocaleString()}\n`;
    });

    checkoutText += `\n💰 *Total: Rp ${totalPrice.toLocaleString()}*\n\nKetik *CONFIRM* untuk menyelesaikan pesanan.`;

    client.sendMessage(userId, checkoutText);
  } else if (message.body.toLowerCase() === "confirm") {
    if (!carts[userId] || carts[userId].length === 0) {
      return client.sendMessage(
        userId,
        "Tidak ada pesanan untuk dikonfirmasi."
      );
    }

    client.sendMessage(
      userId,
      "✅ Pesanan Anda telah dikonfirmasi! Kami akan segera menghubungi Anda."
    );
    delete carts[userId];
  }
});

client.initialize();

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
