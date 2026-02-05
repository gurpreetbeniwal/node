module.exports = (sequelize, DataTypes) => {
    const Attribute = sequelize.define('Attribute', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: DataTypes.STRING(100), allowNull: false, unique: true }
    }, {
        tableName: 'attributes',
        timestamps: false
    });
    return Attribute;
};