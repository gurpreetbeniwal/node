

module.exports = (sequelize, DataTypes) => {
    const AttributeValue = sequelize.define('AttributeValue', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        attribute_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
        value: { type: DataTypes.STRING(100), allowNull: false }
    }, {
        tableName: 'attribute_values',
        timestamps: false
    });
    return AttributeValue;
};
