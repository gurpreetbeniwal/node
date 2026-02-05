module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define('Category', {
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    parent_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false, unique: true },
    description: { type: DataTypes.TEXT }
  }, {
    tableName: 'categories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  Category.associate = (models) => {
    // Each Category may have many Products
    Category.hasMany(models.Product, {
      foreignKey: 'category_id',
      as: 'products'
    });

    // Self-referential hierarchy: a Category may have many child categories
    Category.hasMany(models.Category, {
      foreignKey: 'parent_id',
      as: 'subcategories'
    });

    // And each Category may belong to one parent Category
    Category.belongsTo(models.Category, {
      foreignKey: 'parent_id',
      as: 'parent'
    });
  };

  return Category;
};
