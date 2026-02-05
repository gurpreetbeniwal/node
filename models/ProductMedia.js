module.exports = (sequelize, DataTypes) => {
    const ProductMedia = sequelize.define('ProductMedia', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        url: { type: DataTypes.TEXT, allowNull: false },
        media_type: { type: DataTypes.ENUM('image', 'video'), allowNull: false },
        alt_text: { type: DataTypes.STRING },
        sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
    }, {
        tableName: 'product_media',
        timestamps: false
    });
    return ProductMedia;
};
