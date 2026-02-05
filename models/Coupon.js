// models/Coupon.js
module.exports = (sequelize, DataTypes) => {
    const Coupon = sequelize.define('Coupon', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
        type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false },
        value: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
        minimum_order_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        maximum_discount_amount: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
        usage_limit: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
        used_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        valid_from: { type: DataTypes.DATE, allowNull: false },
        valid_until: { type: DataTypes.DATE, allowNull: false },
        is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    }, {
        tableName: 'coupons',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
    return Coupon;
};
