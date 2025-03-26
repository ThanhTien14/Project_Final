const express = require('express')
const app = express()
const port = 3000
const path = require('path');
const dsTPCN = require('./dsTPCN'); // Đọc file dữ liệu ở đầu trang

app.use(express.static(path.join(__dirname, 'public/pages')));
app.use(express.static(path.join(__dirname, 'public/images/')));

// index page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/pages/index.html');
});

app.get('/products', (req, res) => {
    res.sendFile(__dirname + '/public/pages/products.html');
  });

  app.get('/api/products-data', (req, res) => {
    try {
        res.json(dsTPCN); // Sử dụng biến đã được require ở đầu trang
    } catch (error) {
        console.error('Lỗi khi lấy file dsTPCN.js:', error);
        res.status(500).json({ message: 'Lỗi khi lấy dữ liệu sản phẩm từ server.' });
    }
    });

app.listen(port, () => console.log(`Example app listening on port ${port}!`))