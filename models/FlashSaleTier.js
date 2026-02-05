module.exports = (sequelize, DataTypes) => {
  const FlashSaleTier = sequelize.define('FlashSaleTier', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    flash_sale_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'flash_sales',
        key: 'id'
      }
    },
    tier_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Tier display name like "Early Bird"'
    },
    member_limit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Max members for this tier (DYNAMIC)'
    },
    discount_percent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 100
      },
      comment: 'Discount percentage (DYNAMIC)'
    },
    used_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'How many members used this tier'
    },
    tier_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Tier sequence: 1, 2, 3...'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this tier is still available'
    }
  }, {
    tableName: 'flash_sale_tiers',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['flash_sale_id', 'tier_order']
      }
    ]
  });

  return FlashSaleTier;
};
