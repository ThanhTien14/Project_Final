// server.js
const express = require('express');
const path = require('path');
const mongodbModule = require('./public/javascripts/mongodb');
const router = express.Router();
const app = express();
const port = 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10kb' }));
app.set('views', path.join(__dirname, 'public', 'pages'));
app.set('view engine', 'ejs');

// Hàm validate dữ liệu sản phẩm
function validateProductData(data, isUpdate = false) {
    const errors = [];
    if (!isUpdate) {
        if (!data.id || !/^TPCN\d{4}$/.test(data.id)) {
            errors.push('ID phải có định dạng TPCNxxxx');
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            errors.push('Tên sản phẩm là bắt buộc');
        }
        if (!Number.isInteger(data.quantity_in_stock) || data.quantity_in_stock < 0) {
            errors.push('Số lượng tồn kho phải là số nguyên không âm');
        }
        if (typeof data.price !== 'number' || data.price <= 0) {
            errors.push('Giá phải là số dương');
        }
    } else {
        if (data.id) {
            errors.push('Không được thay đổi ID sản phẩm');
        }
    }
    if (data.image_url && !/^https?:\/\/.+\..+/.test(data.image_url)) {
        errors.push('image_url phải là URL hợp lệ');
    }
    if (data.currency && !['VND', 'USD'].includes(data.currency)) {
        errors.push('Tiền tệ chỉ được là VND hoặc USD');
    }
    return errors;
}

// Hàm chuẩn hóa dữ liệu
function normalizeProductData(data) {
    const normalized = { ...data };
    normalized.updated_at = new Date();
    ['ingredients', 'benefits', 'target_audience', 'certifications'].forEach(field => {
        if (typeof normalized[field] === 'string' && normalized[field].trim()) {
            normalized[field] = normalized[field].split(',').map(item => item.trim()).filter(item => item);
        } else if (!normalized[field]) {
            normalized[field] = [];
        }
    });
    return normalized;
}

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Route root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

// Kết nối MongoDB
mongodbModule.connectToMongoDB()
    .then(() => {
        console.log('Kết nối MongoDB thành công!');
        app.listen(port, () => console.log(`Server chạy trên port ${port}!`));
    })
    .catch(err => {
        console.error('Lỗi kết nối MongoDB:', err);
        process.exit(1);
    });

// API: Lấy ID sản phẩm cao nhất
app.get('/api/products/latest-id', async (req, res) => {
    try {
        const latestProduct = await mongodbModule.dbCollection.findOne(
            { id: /^TPCN\d{4}$/ },
            { sort: { id: -1 } }
        );
        res.json({ latestId: latestProduct ? latestProduct.id : null });
    } catch (error) {
        throw error;
    }
});

// API: Tạo một sản phẩm mới
app.post('/api/products', async (req, res) => {
    try {
        const errors = validateProductData(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }
        const productData = normalizeProductData({
            ...req.body,
            created_at: new Date(),
            is_active: true,
            qna: [],
            ratings: [],
        });
        await mongodbModule.dbCollection.insertOne(productData);
        res.status(201).json({ message: `Product ${productData.id} created successfully`, id: productData.id });
    } catch (error) {
        throw error;
    }
});

// API: Lấy danh sách sản phẩm có phân trang
app.get('/api/products', async (req, res) => {
    try {
        const { name, priceFrom, priceTo, category, brand, page = 1, limit = 10 } = req.query;
        const query = {};
        if (name) query.name = { $regex: name, $options: 'i' };
        if (priceFrom) query.price = { $gte: Number(priceFrom) };
        if (priceTo) query.price = { ...query.price, $lte: Number(priceTo) };
        if (category) query.category = category;
        if (brand) query.brand = brand;
        const skip = (page - 1) * limit;
        const [products, totalProducts] = await Promise.all([
          Product.find(query).skip(skip).limit(limit).toArray(),
          Product.countDocuments(query)
        ]);
        const totalPages = Math.ceil(totalProducts / limit);
        res.json({
          products,
          pagination: { currentPage: Number(page), totalPages, totalProducts }
        });
      } catch (error) {
        console.error('Lỗi API sản phẩm:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
});

// API: Lấy chi tiết một sản phẩm
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const products = await mongodbModule.findDocumentsById(id);
        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(products[0]);
    } catch (error) {
        throw error;
    }
});

// API: Cập nhật một sản phẩm
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const errors = validateProductData(req.body, true);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }
        const productData = normalizeProductData(req.body);
        const modifiedCount = await mongodbModule.updateDocumentById(id, productData);
        if (modifiedCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: `Product ${id} updated successfully` });
    } catch (error) {
        throw error;
    }
});

//API tìm kiếm thông tin sản phẩm
app.get('/api/products/search', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name || name.trim().length < 2) {
          return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }
        const products = await Product.find({
          name: { $regex: name.trim(), $options: 'i' }
        }).limit(50).toArray();
        res.json(products.length ? products : []);
      } catch (error) {
        console.error('Lỗi API tìm kiếm:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
});



// Xử lý đóng kết nối MongoDB
process.on('SIGINT', async () => {
    await mongodbModule.closeMongoDBConnection();
    process.exit(0);
});