# Redigo Admin Panel Design System

Use these guidelines and code snippets to maintain UI consistency across all administrative pages.

## Layout Structure
- **Container**: `min-h-screen bg-gray-50 p-6 lg:p-8`
- **Header Block**: 
  ```jsx
  <div className="mb-6">
    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
      <span>Module</span>
      <ChevronRight size={12} />
      <span className="text-gray-700">Current Page</span>
    </div>
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold text-gray-900">Page Title</h1>
      <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>
    </div>
  </div>
  ```

## Components
### 1. Form Card (Section)
```jsx
<div className="bg-white rounded-xl border border-gray-200 p-6">
  <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
    <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
      <Icon size={18} />
    </div>
    <div>
      <h3 className="text-sm font-semibold text-gray-900">Section Title</h3>
      <p className="text-xs text-gray-400">Section description</p>
    </div>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
    {/* Inputs here */}
  </div>
</div>
```

### 2. Form Inputs
- **Base Class**: `const inputClass = "w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors";`
- **Label Class**: `const labelClass = "block text-xs font-semibold text-gray-500 mb-1.5";`

```jsx
<div>
  <label className={labelClass}>
    <Icon size={12} className="inline mr-1 text-gray-400" />
    Field Label *
  </label>
  <input type="text" className={inputClass} placeholder="Placeholder" />
</div>
```

### 3. Sidebar Actions
```jsx
<div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
  <button className="w-full py-3 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
    Primary Action
  </button>
  <button className="w-full py-3 bg-gray-50 text-gray-600 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-100 transition-colors">
    Secondary Action
  </button>
</div>
```

## Typography & Colors
- **Font**: Inter / System Sans-serif
- **Primary Color**: Indigo-600 (`#4f46e5`)
- **Background**: Gray-50 (`#f9fafb`)
- **Borders**: Gray-200 (`#e5e7eb`)
- **Text Primary**: Gray-900 (`#111827`)
- **Text Secondary**: Gray-500 (`#6b7280`)
