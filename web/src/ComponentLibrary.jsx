// React Admin Dashboard - UI Component Library

import React from 'react';
import { X } from 'lucide-react';

// ============================================================================
// BUTTON COMPONENTS
// ============================================================================

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  ...props
}) {
  const baseStyles = 'font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-gray-300',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 focus:ring-blue-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${disabled ? 'cursor-not-allowed' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

// ============================================================================
// CARD COMPONENT
// ============================================================================

export function Card({ children, title, subtitle, action, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl shadow-subtle border border-gray-200 p-6 ${className}`}>
      {(title || subtitle || action) && (
        <div className="flex justify-between items-start mb-4">
          <div>
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ============================================================================
// SUMMARY CARD (KPI)
// ============================================================================

export function SummaryCard({ title, value, change, color = 'primary', icon }) {
  const bgColors = {
    primary: 'from-blue-50 to-blue-100',
    success: 'from-green-50 to-green-100',
    alert: 'from-red-50 to-red-100',
  };

  const textColors = {
    primary: 'text-blue-600',
    success: 'text-green-600',
    alert: 'text-red-600',
  };

  const borderColors = {
    primary: 'border-blue-200',
    success: 'border-green-200',
    alert: 'border-red-200',
  };

  return (
    <div className={`bg-gradient-to-br ${bgColors[color]} p-6 rounded-2xl border ${borderColors[color]}`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
      <p className={`text-4xl font-bold ${textColors[color]}`}>{value}</p>
      {change && <p className="text-sm text-green-600 mt-2">↑ {change}</p>}
    </div>
  );
}

// ============================================================================
// INPUT & FORM COMPONENTS
// ============================================================================

export function Input({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <input
        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-200'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

export function Select({ label, options, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <select
        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-500' : 'border-gray-200'
        } ${className}`}
        {...props}
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <textarea
        className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
          error ? 'border-red-500' : 'border-gray-200'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

// ============================================================================
// TABLE COMPONENT
// ============================================================================

export function Table({ columns, data, onRowClick, expandedRowId, expandedRowRenderer }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map(col => (
              <th key={col.key} className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <React.Fragment key={idx}>
              <tr
                className={`border-b border-gray-100 transition-colors ${onRowClick ? 'cursor-pointer hover:bg-blue-50' : ''} ${expandedRowId === row.id ? 'bg-blue-50/50' : ''}`}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className="px-6 py-4 text-gray-900">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
              {expandedRowId === row.id && expandedRowRenderer && (
                <tr className="bg-gray-50/50 border-b border-gray-200 shadow-inner">
                  <td colSpan={columns.length} className="p-0">
                    {expandedRowRenderer(row)}
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// PAGINATION COMPONENT
// ============================================================================

export function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex justify-between items-center px-6 py-4 bg-gray-50 border-t border-gray-200">
      <span className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL COMPONENT
// ============================================================================

export function Modal({ isOpen, onClose, title, children, actions }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-large max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">{children}</div>

        {/* Actions */}
        {actions && (
          <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ALERT/NOTIFICATION COMPONENT
// ============================================================================

export function Alert({ type = 'info', title, message, onClose }) {
  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className={`${colors[type]} border rounded-lg p-4 flex justify-between items-start`}>
      <div>
        {title && <h4 className="font-semibold">{title}</h4>}
        {message && <p className="text-sm mt-1">{message}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-70 hover:opacity-100">
          <X size={18} />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// PROGRESS BAR COMPONENT
// ============================================================================

export function ProgressBar({ value, label, color = 'primary' }) {
  const colors = {
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    alert: 'bg-red-500',
    warning: 'bg-yellow-500',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">{value}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div className={`${colors[color]} h-3 rounded-full`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );
}

// ============================================================================
// BADGE COMPONENT
// ============================================================================

export function Badge({ label, variant = 'primary' }) {
  const variants = {
    primary: 'bg-blue-100 text-blue-700',
    success: 'bg-green-100 text-green-700',
    alert: 'bg-red-100 text-red-700',
    warning: 'bg-yellow-100 text-yellow-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${variants[variant]}`}>
      {label}
    </span>
  );
}

// ============================================================================
// SKELETON LOADER
// ============================================================================

export function Skeleton({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`}></div>;
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} width={`w-${(j + 2) * 12}`} height="h-8" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/*
// Basic Button
<Button variant="primary" size="md">Click Me</Button>

// Summary Card
<SummaryCard
  title="Total Fees"
  value="₹24,50,000"
  icon="💰"
  color="primary"
/>

// Input with validation
<Input
  label="Email"
  type="email"
  placeholder="admin@hda.com"
  error={errors.email}
/>

// Table
<Table
  columns={[
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    {
      key: 'actions',
      label: 'Actions',
      render: (value, row) => (
        <Button size="sm" variant="secondary">
          View
        </Button>
      ),
    },
  ]}
  data={students}
  onRowClick={(row) => console.log(row)}
/>

// Modal with confirmation
<Modal
  isOpen={showDeleteModal}
  onClose={() => setShowDeleteModal(false)}
  title="Confirm Delete"
  actions={[
    <Button key="cancel" variant="secondary" onClick={() => setShowDeleteModal(false)}>
      Cancel
    </Button>,
    <Button key="delete" variant="danger" onClick={handleDelete}>
      Delete
    </Button>,
  ]}
>
  <p>Are you sure you want to delete this student record?</p>
</Modal>
*/
