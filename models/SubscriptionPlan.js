module.exports = (sequelize, DataTypes) => {
  const SubscriptionPlan = sequelize.define('SubscriptionPlan', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Plan name like "Plus Membership"'
    },
    duration_days: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 365,
      comment: 'Plan duration in days (365 for 1 year)'
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Plan price'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether plan is available for purchase'
    }
  }, {
    tableName: 'subscription_plans',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return SubscriptionPlan;
};
