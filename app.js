const express = require('express')
const app = express()
const port = 3000
const path = require('path');
const bodyParser = require('body-parser');
const mongodbModule = require('./public/javascript/mongodb'); // Đọc file mongodbModule.js

app.use(express.static(path.join(__dirname, 'public/pages')));
app.use(express.static(path.join(__dirname, 'public/images/')));
app.use(express.static(path.join(__dirname, 'public/stylesheets/')));
app.use(bodyParser.json());

// Trang chính
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/pages/index.html');
});
  
// API để lấy danh sách sản phẩm
app.get('/products-data', async (req, res) => {
  try {
    const dsTPCN = await mongodbModule.findDocuments();
    res.json(dsTPCN);
  } 
  catch (error) {
    console.error('Lỗi khi lấy file dsTPCN.js:', error);
    res.status(500).json({ message: 'Lỗi khi lấy dữ liệu sản phẩm từ server.' });
  }
});

// Route để trả về file HTML productInfor.html
app.get('/product-data/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/pages/productInfor.html'));
});

// API để lấy thông tin chi tiết của một sản phẩm theo ID
app.get('/products-data/:id', async (req, res) => {
  const productId = req.params.id;
  const product = await mongodbModule.findDocumentsById(productId);

  if (product) {
      res.json(product);
  } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm với ID: ' + productId });
  }
});

//API để mở trang add.html
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

const server = app.listen(port, () => console.log(`Example app listening on port ${port}!`))

mongodbModule.connectToMongoDB()
  .then(() => {
    console.log('Kết nối MongoDB thành công!');
  })
  .catch(err => {
    console.error('Lỗi kết nối MongoDB:', err);
    server.close();
  });

// Đóng kết nối MongoDB khi server dừng lại
process.on('SIGINT', () => {
  mongodbModule.closeMongoDBConnection()
});
