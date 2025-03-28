const express = require('express')
const app = express()
const port = 3000
const path = require('path');
const bodyParser = require('body-parser');
const dsTPCN = require('./dsTPCN'); // Đọc file dữ liệu ở đầu trang

app.use(express.static(path.join(__dirname, 'public/pages')));
app.use(express.static(path.join(__dirname, 'public/images/')));
app.use(bodyParser.json());

// index page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/pages/index.html');
});

app.get('/products', (req, res) => {
  res.sendFile(__dirname + '/public/pages/products.html');
});
  
app.get('/products-data', (req, res) => {
  try {
    res.json(dsTPCN); // Sử dụng biến đã được require ở đầu trang
  } 
  catch (error) {
    console.error('Lỗi khi lấy file dsTPCN.js:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu sản phẩm từ server.' });
  }
});

// API endpoint để lấy thông tin chi tiết của một sản phẩm theo ID
app.get('/products-data/:id', (req, res) => {
  // **Bước 2: Server lấy được ID sản phẩm từ request**
  const productId = req.params.id;
  // **Bước 3: Server dùng ID để tìm thông tin sản phẩm trong mảng dsTPCN**
  const product = dsTPCN.find(p => p.id === productId);

  if (product) {
      // **Bước 4: Server gửi thông tin sản phẩm dưới dạng JSON**
      res.json(product);
  } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm với ID: ' + productId });
  }
});
// Route để phục vụ trang add.html
app.get('/add-product', (req, res) => {
  res.sendFile(__dirname + '/public/pages/add.html');
});

// API endpoint để cập nhật thông tin sản phẩm
app.put('/update-product/:id', (req, res) => {
  const productId = req.params.id;
  const updatedProduct = req.body;

  const productIndex = dsTPCN.findIndex(p => p.id === productId);

  if (productIndex !== -1) {
      // Cập nhật thông tin sản phẩm trong mảng dsTPCN
      dsTPCN[productIndex] = { ...dsTPCN[productIndex], ...updatedProduct };
      res.json({ message: `Sản phẩm với ID ${productId} đã được cập nhật thành công.` });
  } else {
      res.status(404).json({ message: `Không tìm thấy sản phẩm với ID: ${productId}.` });
  }
});

app.get('*', (req, res) => {
  res.status(404).send('Xin lỗi, trang không tồn tại!');
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`))