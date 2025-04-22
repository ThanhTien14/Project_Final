const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongodbModule = require('./public/javascripts/mongodb');
const app = express();
const port = 3000;

// Thiết lập multer để xử lý upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/images/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const productId = req.params.id; // Lấy productId từ URL
        const timestamp = Date.now();
        const extension = path.extname(file.originalname);
        cb(null, `${productId}-${timestamp}${extension}`); // Đặt tên: <product_id>-<timestamp>.<extension>
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 50MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ file hình ảnh (jpeg, jpg, png, gif)'));
        }
    }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/images/uploads')));
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
        if (data.name && (typeof data.name !== 'string' || data.name.trim() === '')) {
            errors.push('Tên sản phẩm không hợp lệ');
        }
        if (data.quantity_in_stock !== undefined && (!Number.isInteger(data.quantity_in_stock) || data.quantity_in_stock < 0)) {
            errors.push('Số lượng tồn kho phải là số nguyên không âm');
        }
        if (data.price !== undefined && (typeof data.price !== 'number' || data.price <= 0)) {
            errors.push('Giá phải là số dương');
        }
    }
    if (data.image_url) {
        if (data.image_url.startsWith('/images/uploads/')) {
            if (!/^\/images\/uploads\/.+/.test(data.image_url)) {
                errors.push('image_url phải là đường dẫn hợp lệ bắt đầu bằng /images/uploads/');
            }
        } else {
            const urlPattern = /^(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/i;
            if (!urlPattern.test(data.image_url)) {
                errors.push('URL hình ảnh không hợp lệ (phải là link tới file ảnh: png, jpg, jpeg, gif, webp)');
            }
        }
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

// API: Lấy ID sản phẩm cao nhất
// app.get('/api/products/latest-id', async (req, res) => {
//     try {
//         const latestProduct = await mongodbModule.dbCollection.findOne(
//             { id: /^TPCN\d{4}$/ },
//             { sort: { id: -1 } }
//         );
//         res.json({ latestId: latestProduct ? latestProduct.id : null });
//     } catch (error) {
//         throw error;
//     }
// });

// API: Tạo một sản phẩm mới
// app.post('/api/products', async (req, res) => {
//     try {
//         const errors = validateProductData(req.body);
//         if (errors.length > 0) {
//             return res.status(400).json({ error: 'Invalid data', details: errors });
//         }
//         const productData = normalizeProductData({
//             ...req.body,
//             created_at: new Date(),
//             is_active: true,
//             qna: [],
//             ratings: [],
//         });
//         await mongodbModule.dbCollection.insertOne(productData);
//         res.status(201).json({ message: `Product ${productData.id} created successfully`, id: productData.id });
//     } catch (error) {
//         throw error;
//     }
// });

// API: Lấy danh sách sản phẩm có phân trang, sắp xếp và validate category, brand
app.get('/api/products', async (req, res) => {
    try {
        const { name, priceFrom, priceTo, category, brand, page = 1, limit = 10, sort = 'price', order = 'asc', logic } = req.query;

        // Validate page and limit
        if (priceFrom && (isNaN(priceFrom) || Number(priceFrom) < 0)) {
            return res.status(400).json({ error: 'Invalid priceFrom' });
        }
        if (priceTo && (isNaN(priceTo) || Number(priceTo) < 0)) {
        return res.status(400).json({ error: 'Invalid priceTo' });
        }
        const validCategories = ['BDN', 'HSTK', 'Khoáng chất', 'LD'];
        if (category && !validCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
        }

        // Build query object
        let query = {};
        if (logic === 'OR' && (name || category || brand)) {
            const orQueries = [];
            if (name) orQueries.push({ name: { $regex: name, $options: 'i' } });
            if (category) orQueries.push({ category });
            if (brand) orQueries.push({ brand });
            query = { $or: orQueries };
        } else {
            if (name) query.name = { $regex: name, $options: 'i' };
            if (category) query.category = category;
            if (brand) query.brand = brand;
        }
        if (priceFrom || priceTo) {
        query.price = {};
        if (priceFrom) query.price.$gte = Number(priceFrom);
        if (priceTo) query.price.$lte = Number(priceTo);
        }

        // sort
        const sortOptions = {};
        if (sort === 'price') sortOptions.price = order === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;
        const [products, totalProducts] = await Promise.all([
            mongodbModule.dbCollection.find(query).skip(skip).limit(Number(limit)).toArray(),
            mongodbModule.dbCollection.countDocuments(query)
        ]);

        const totalPages = Math.ceil(totalProducts / limit);
        res.json({
          products: products.map(product => normalizeProductData(product)),
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
        const product = await mongodbModule.dbCollection.findOne({ id: req.params.id });
        if (!product) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json(product);
    } catch (error) {
        throw error;
    }
});

// API: Cập nhật nhiều sản phẩm
app.put('/api/products/bulk', async (req, res) => {
    try {
        console.log('PUT /api/products/bulk - Request received');
        console.log('PUT /api/products/bulk - Request body:', req.body);
        const { productIds, updateData } = req.body;

        // Parse dữ liệu (do client gửi dưới dạng JSON string trong FormData hoặc body)
        let parsedProductIds, parsedUpdateData;
        try {
            parsedProductIds = typeof productIds === 'string' ? JSON.parse(productIds) : productIds;
            parsedUpdateData = typeof updateData === 'string' ? JSON.parse(updateData) : updateData;
        } catch (error) {
            console.log('PUT /api/products/bulk - Error: Invalid JSON format');
            return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
        }

        if (!parsedProductIds || !Array.isArray(parsedProductIds) || parsedProductIds.length === 0) {
            console.log('PUT /api/products/bulk - Error: Missing productIds');
            return res.status(400).json({ error: 'Vui lòng cung cấp danh sách ID sản phẩm' });
        }

        if (!parsedUpdateData || Object.keys(parsedUpdateData).length === 0) {
            console.log('PUT /api/products/bulk - Error: Missing updateData');
            return res.status(400).json({ error: 'Vui lòng cung cấp ít nhất một thông tin để cập nhật' });
        }

        // Kiểm tra dữ liệu hợp lệ
        const errors = validateProductData(parsedUpdateData, true);
        if (errors.length > 0) {
            console.log('PUT /api/products/bulk - Validation errors:', errors);
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }

        // Xử lý hình ảnh
        if (req.file) {
            parsedUpdateData.image_url = `/images/uploads/${req.file.filename}`;
        }

        // Chuẩn hóa dữ liệu
        const normalizedData = normalizeProductData(parsedUpdateData);

        // Log để kiểm tra productIds trước khi query
        console.log('Product IDs to update:', parsedProductIds);

        // Kiểm tra sản phẩm tồn tại
        console.log('Querying MongoDB with:', { id: { $in: parsedProductIds } });
        const existingProducts = await mongodbModule.dbCollection.find({ id: { $in: parsedProductIds } }).toArray();
        console.log('Existing products:', existingProducts.map(p => p.id));

        const existingIds = existingProducts.map(p => p.id);
        const notFoundIds = parsedProductIds.filter(id => !existingIds.includes(id));

        if (existingIds.length === 0) {
            console.log('PUT /api/products/bulk - No products found for IDs:', parsedProductIds); 
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm nào để cập nhật' });
        }

        // Cập nhật các sản phẩm tồn tại
        console.log('Updating products with IDs:', existingIds);
        const result = await mongodbModule.dbCollection.updateMany(
            { id: { $in: existingIds } },
            { $set: normalizedData }
        );

        console.log('Update result:', result);

        let message = `Cập nhật ${result.matchedCount} sản phẩm thành công`;
        if (notFoundIds.length > 0) {
            message += `. Không tìm thấy sản phẩm: ${notFoundIds.join(', ')}`;
        }

        console.log('PUT /api/products/bulk - Updated:', result.matchedCount, 'products');
        res.json({ message: `Cập nhật ${result.matchedCount} sản phẩm thành công` });
    } catch (error) {
        console.error('PUT /api/products/bulk - Error:', error);
        res.status(500).json({ error: 'Lỗi server nội bộ', details: error.message });
    }
});

// API: Cập nhật một sản phẩm
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        console.log('PUT /api/products/:id - Request received');
        console.log('PUT /api/products/:id - Request body:', req.body);
        console.log('PUT /api/products/:id - File:', req.file);

        const updateData = req.body;

        // Parse dữ liệu nếu cần (do client có thể gửi FormData)
        let parsedUpdateData = updateData;
        if (typeof updateData.updateData === 'string') {
            try {
                parsedUpdateData = JSON.parse(updateData.updateData);
            } catch (error) {
                console.log('PUT /api/products/:id - Error: Invalid JSON format in updateData');
                return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
            }
        }

        // Chuyển đổi giá trị số
        if (parsedUpdateData.quantity_in_stock) {
            parsedUpdateData.quantity_in_stock = parseInt(parsedUpdateData.quantity_in_stock);
        }
        if (parsedUpdateData.price) {
            parsedUpdateData.price = parseFloat(parsedUpdateData.price);
        }

        // Kiểm tra dữ liệu hợp lệ
        const errors = validateProductData(parsedUpdateData, true);
        if (errors.length > 0) {
            console.log('PUT /api/products/:id - Validation errors:', errors);
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: errors });
        }

        // Kiểm tra sản phẩm tồn tại
        console.log('Querying MongoDB for product ID:', req.params.id);
        const existingProduct = await mongodbModule.dbCollection.findOne({ id: req.params.id });
        console.log('Existing product:', existingProduct ? existingProduct.id : 'Not found');
        if (!existingProduct) {
            console.log('PUT /api/products/:id - No product found for ID:', req.params.id);
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        // Xử lý hình ảnh
        if (req.file) {
            if (existingProduct.image_url && existingProduct.image_url.startsWith('/images/uploads/')) {
                const oldImageRelativePath = existingProduct.image_url.replace(/^\/images\/uploads\//, '');
                const oldImagePath = path.join(__dirname, 'public', 'images', 'uploads', oldImageRelativePath);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                    console.log('Deleted old image:', oldImagePath);
                }
            }
            parsedUpdateData.image_url = `/images/uploads/${req.file.filename}`;
            console.log('PUT /api/products/:id - New image uploaded:', parsedUpdateData.image_url);
        }

        // Chuẩn hóa dữ liệu
        const normalizedData = normalizeProductData(parsedUpdateData);

        // Kiểm tra xem có thay đổi thực sự nào không
        const isUnchanged = Object.keys(normalizedData).every(key => {
            if (Array.isArray(normalizedData[key]) && Array.isArray(existingProduct[key])) {
                return normalizedData[key].length === existingProduct[key].length &&
                    normalizedData[key].every((item, idx) => item === existingProduct[key][idx]);
            }
            return normalizedData[key] === existingProduct[key];
        });

        if (isUnchanged && !req.file) {
            console.log('PUT /api/products/:id - No changes detected for product:', req.params.id);
            return res.status(400).json({ error: 'Không có thông tin nào được thay đổi' });
        }

        // Cập nhật sản phẩm
        console.log('Updating product with ID:', req.params.id);
        const result = await mongodbModule.dbCollection.updateOne(
            { id: req.params.id },
            { $set: normalizedData }
        );

        // Log kết quả cập nhật
        console.log('Update result:', result);
        
        if (result.matchedCount === 0) {
            console.log('PUT /api/products/:id - No product matched for update, ID:', req.params.id);
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        console.log('PUT /api/products/:id - Updated product:', req.params.id);
        res.json({ message: 'Cập nhật sản phẩm thành công' });
    } catch (error) {
        console.error('PUT /api/products/:id - Error:', error);
        if (error.message.includes('file')) {
            return res.status(400).json({ error: 'Lỗi khi xử lý file ảnh', details: error.message });
        }
        res.status(500).json({ error: 'Lỗi server nội bộ', details: error.message });
    }
});

//API tìm kiếm thông tin sản phẩm
app.get('/api/products/search', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name || name.trim().length < 2) {
          return res.status(400).json({ error: 'Search query must be at least 2 characters' });
        }
        const products = await mongodbModule.dbCollection.find({
          name: { $regex: name.trim(), $options: 'i' }
        }).limit(50).toArray();
        res.json(products.length ? products : []);
      } catch (error) {
        console.error('Lỗi API tìm kiếm:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
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

// Xử lý đóng kết nối MongoDB
process.on('SIGINT', async () => {
    await mongodbModule.closeMongoDBConnection();
    process.exit(0);
});