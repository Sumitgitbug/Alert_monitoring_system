import { Upload } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

function BulkUpload({ onUpload, uploading, categories = [] }) {
  const [category, setCategory] = useState(categories[0] ?? "")
  const [customCategory, setCustomCategory] = useState("")
  const selectedCategory = useMemo(
    () => category === "__new__" ? customCategory.trim() : category.trim(),
    [category, customCategory],
  )

  useEffect(() => {
    if (!category && categories.length) {
      setCategory(categories[0])
    }
  }, [categories, category])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (file && selectedCategory) {
      onUpload(file, selectedCategory)
    }
    event.target.value = ""
  }

  return (
    <div className="bulk-upload">
      <div>
        <h3>Bulk Upload</h3>
        <p>Upload Excel or CSV with device name, IP address, and location. Selected category will be filled automatically.</p>
      </div>
      <div className="bulk-fields">
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Select category</option>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
            <option value="__new__">Create New Category</option>
          </select>
        </label>
        {category === "__new__" ? (
          <label>
            <span>New Category</span>
            <input
              value={customCategory}
              onChange={(event) => setCustomCategory(event.target.value)}
              placeholder="Firewall"
            />
          </label>
        ) : null}
      </div>
      <label className="upload-btn">
        <Upload size={16} />
        {uploading ? "Uploading..." : "Choose Excel / CSV"}
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={uploading || !selectedCategory}
          onChange={handleFileChange}
        />
      </label>
      {!selectedCategory ? <small className="upload-hint">Select or create a category before upload.</small> : null}
    </div>
  )
}

export default BulkUpload
