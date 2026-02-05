module.exports = (sequelize, DataTypes) => {
    const Address = sequelize.define('Address', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        user_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        street_address: { type: DataTypes.STRING, allowNull: false },
        city: { type: DataTypes.STRING(100), allowNull: false },
        state: { type: DataTypes.STRING(100), allowNull: false },
        postal_code: { type: DataTypes.STRING(20), allowNull: false },
        country: { type: DataTypes.STRING(100), allowNull: false },
        phone_number: { type: DataTypes.STRING(20), allowNull: false },
        is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    }, {
        tableName: 'addresses',
        timestamps: false
    });
    return Address;
};
