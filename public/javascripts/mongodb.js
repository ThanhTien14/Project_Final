// Kết nối MongoDB 
const { MongoClient } = require('mongodb');
const mongodbUrl = 'mongodb://localhost:27017';
const dbName = 'mydatabase';
const collectionName = 'dsTPCN';

let dbCollection;
let client;

async function connectToMongoDB() {
    try {
        client = await MongoClient.connect(mongodbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        dbCollection = client.db(dbName).collection(collectionName);
        console.log('Kết nối MongoDB thành công!');
        return dbCollection;
    } catch (err) {
        console.error('Lỗi kết nối MongoDB:', err);
        throw err;
    }
}

async function closeMongoDBConnection() {
    if (client) {
        try {
            await client.close();
            console.log('Đã đóng kết nối MongoDB!');
        } catch (err) {
            console.error('Lỗi khi đóng kết nối MongoDB:', err);
            throw err;
        }
    }
}

async function findDocumentsByName(productName) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const products = await dbCollection
            .find({ name: { $regex: productName, $options: 'i' } })
            .toArray();
        return products;
    } catch (err) {
        console.error('Lỗi khi tìm kiếm theo tên:', err);
        throw err;
    }
}

async function findDocumentsById(productId) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const products = await dbCollection
            .find({ id: productId })
            .toArray();
        return products;
    } catch (err) {
        console.error('Lỗi khi tìm kiếm theo ID:', err);
        throw err;
    }
}

async function findDocuments(criteria = {}) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const query = {};
        if (criteria.name) query.name = { $regex: criteria.name, $options: 'i' };
        if (criteria.priceFrom || criteria.priceTo) {
            query.price = {};
            if (criteria.priceFrom) query.price.$gte = parseInt(criteria.priceFrom);
            if (criteria.priceTo) query.price.$lte = parseInt(criteria.priceTo);
        }
        if (criteria.category) query.category = criteria.category;
        if (criteria.brand) query.brand = criteria.brand;
        if (criteria.logic === 'OR' && (criteria.name || criteria.category || criteria.brand)) {
            const orQueries = [];
            if (criteria.name) orQueries.push({ name: { $regex: criteria.name, $options: 'i' } });
            if (criteria.category) orQueries.push({ category: criteria.category });
            if (criteria.brand) orQueries.push({ brand: criteria.brand });
            return await dbCollection.find({ $or: orQueries }).toArray();
        }
        return await dbCollection.find(query).toArray();
    } catch (err) {
        console.error('Lỗi khi tìm kiếm:', err);
        throw err;
    }
}

async function findLatestDocuments(limit = 10) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        return await dbCollection
            .find({})
            .sort({ created_at: -1 })
            .limit(limit)
            .toArray();
    } catch (err) {
        console.error('Lỗi khi lấy danh sách mới nhất:', err);
        throw err;
    }
}

async function updateDocumentById(id, updatedData) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const result = await dbCollection.updateOne(
            { id },
            { $set: { ...updatedData, updated_at: new Date() } }
        );
        return result.modifiedCount;
    } catch (err) {
        console.error('Lỗi khi cập nhật sản phẩm:', err);
        throw err;
    }
}

async function updateManyDocuments(query, updatedData) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const result = await dbCollection.updateMany(
            query,
            { $set: { ...updatedData, updated_at: new Date() } }
        );
        return result.modifiedCount;
    } catch (err) {
        console.error('Lỗi khi cập nhật nhiều sản phẩm:', err);
        throw err;
    }
}

async function deleteDocumentById(id) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const result = await dbCollection.deleteOne({ id });
        return result.deletedCount;
    } catch (err) {
        console.error('Lỗi khi xóa sản phẩm:', err);
        throw err;
    }
}

async function deleteManyDocuments(query) {
    try {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        const result = await dbCollection.deleteMany(query);
        return result.deletedCount;
    } catch (err) {
        console.error('Lỗi khi xóa nhiều sản phẩm:', err);
        throw err;
    }
}

module.exports = {
    connectToMongoDB,
    closeMongoDBConnection,
    findDocumentsByName,
    findDocumentsById,
    findDocuments,
    findLatestDocuments,
    updateDocumentById,
    updateManyDocuments,
    deleteDocumentById,
    deleteManyDocuments,
    get dbCollection() {
        if (!dbCollection) throw new Error('Chưa kết nối tới MongoDB');
        return dbCollection;
    },
};