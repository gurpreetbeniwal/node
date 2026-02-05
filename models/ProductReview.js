module.exports = (sequelize, DataTypes) => {
    const ProductReview = sequelize.define('ProductReview', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        product_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        rating: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false, validate: { min: 1, max: 5 } },
        comment: { type: DataTypes.TEXT }
    }, {
        tableName: 'product_reviews',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false
    });
    return ProductReview;
};
