import { MedFlowRow, DataSummary } from '../types';

// Map common variations of headers to standard keys
const HEADER_MAPPING: Record<string, keyof MedFlowRow> = {
    'supplier': 'SupplierID', 'vendor': 'SupplierID', 'sup': 'SupplierID', 'supplierid': 'SupplierID',
    'customer': 'CustomerID', 'client': 'CustomerID', 'cust': 'CustomerID', 'customerid': 'CustomerID',
    'date': 'Deliverdate', 'deliverydate': 'Deliverdate', 'deliverdate': 'Deliverdate',
    'category': 'Category', 'type': 'Category',
    'license': 'LicenseNo', 'licenseno': 'LicenseNo',
    'model': 'Model',
    'lot': 'LotNO', 'lotno': 'LotNO',
    'serial': 'SerNo', 'serno': 'SerNo', 'sn': 'SerNo',
    'qty': 'Number', 'quantity': 'Number', 'number': 'Number', 'count': 'Number',
    'udid': 'UDID',
    'devicename': 'DeviceNAME', 'device': 'DeviceNAME'
};

const standardizeRow = (row: any): MedFlowRow => {
    const newRow: any = {
        SupplierID: '', Deliverdate: '', CustomerID: '', LicenseNo: '', Category: '',
        UDID: '', DeviceNAME: '', LotNO: '', SerNo: '', Model: '', Number: 0
    };

    Object.keys(row).forEach(key => {
        const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
        const standardKey = HEADER_MAPPING[lowerKey] || 
                            Object.keys(HEADER_MAPPING).find(k => lowerKey.includes(k));
        
        if (standardKey) {
            newRow[standardKey] = row[key];
        } else {
            // Best effort fallback
            if(Object.keys(newRow).includes(key)) newRow[key] = row[key];
        }
    });
    
    // Type Coercion & Date Parsing
    newRow.Number = parseInt(String(newRow.Number || 0)) || 0;
    
    const dateStr = String(newRow.Deliverdate || '').replace(/[^0-9]/g, '');
    if (dateStr.length === 8) {
        const y = parseInt(dateStr.substring(0, 4));
        const m = parseInt(dateStr.substring(4, 6)) - 1;
        const d = parseInt(dateStr.substring(6, 8));
        newRow.parsedDate = new Date(y, m, d);
    }

    return newRow as MedFlowRow;
};

export const parseRawInput = (input: string): MedFlowRow[] => {
    try {
        // Try JSON first
        const jsonData = JSON.parse(input);
        if (Array.isArray(jsonData)) {
            return jsonData.map(standardizeRow);
        }
        return []; // Valid JSON but not array
    } catch (e) {
        // Fallback to CSV
        return parseMedFlowCSV(input);
    }
};

export const parseMedFlowCSV = (text: string): MedFlowRow[] => {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const rows: MedFlowRow[] = [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    // Allow lenient column count if parsing non-standard data, but try to match
    const rowObj: any = {};
    
    headers.forEach((h, idx) => {
        rowObj[h] = cols[idx] ? cols[idx].replace(/^"|"$/g, '') : '';
    });
    
    rows.push(standardizeRow(rowObj));
  }

  return rows;
};

export const summarizeData = (data: MedFlowRow[]): DataSummary => {
    const totalUnits = data.reduce((sum, r) => sum + r.Number, 0);
    const suppliers = new Set(data.map(r => r.SupplierID).filter(Boolean)).size;
    const customers = new Set(data.map(r => r.CustomerID).filter(Boolean)).size;
    const categories = new Set(data.map(r => r.Category).filter(Boolean)).size;

    const dates = data.filter(r => r.parsedDate).map(r => r.parsedDate!.getTime());
    const minDate = dates.length ? new Date(Math.min(...dates)).toISOString().split('T')[0] : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)).toISOString().split('T')[0] : null;

    // Helper for top N aggregation
    const topN = (key: keyof MedFlowRow, limit: number = 5) => {
        const counts: Record<string, number> = {};
        data.forEach(r => {
            const k = String(r[key] || 'Unknown');
            counts[k] = (counts[k] || 0) + r.Number;
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([k, v]) => ({ key: k, units: v }));
    };

    // Daily Trend Aggregation
    const dailyMap = new Map<string, { units: number, orders: number }>();
    data.forEach(r => {
        if (!r.parsedDate) return;
        const d = r.parsedDate.toISOString().split('T')[0];
        if (!dailyMap.has(d)) dailyMap.set(d, { units: 0, orders: 0 });
        const entry = dailyMap.get(d)!;
        entry.units += r.Number;
        entry.orders += 1;
    });
    const daily_trend = Array.from(dailyMap.entries())
        .map(([date, val]) => ({ date, units: val.units, orders: val.orders }))
        .sort((a, b) => a.date.localeCompare(b.date));

    // Scatter Plot Data (Time vs Qty)
    const scatter_data = data
        .filter(r => r.parsedDate)
        .map(r => ({
            x: r.parsedDate!.getTime(),
            y: r.Number,
            z: 1, // Optional Z-axis for bubble size if needed later
            name: r.Category
        }))
        .slice(0, 100); // Limit scatter points for performance

    // Top Models with Fill placeholder (colors assigned in UI)
    const top_models = topN('Model', 7).map(m => ({ ...m, fill: '#8884d8' }));
    
    // Top Licenses
    const top_licenses = topN('LicenseNo', 5);

    return {
        rows: data.length,
        total_units: totalUnits,
        unique: { suppliers, customers, categories },
        date_range: { min: minDate, max: maxDate },
        top_suppliers: topN('SupplierID'),
        top_customers: topN('CustomerID'),
        top_categories: topN('Category'),
        top_models,
        top_licenses,
        daily_trend,
        scatter_data,
        sample_rows: data.slice(0, 5)
    };
};
