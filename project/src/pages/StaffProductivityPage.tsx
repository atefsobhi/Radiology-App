import React, { useState, useEffect, useCallback } from 'react';
import { Users, Calendar, Activity, Upload, AlertCircle, Filter, PieChart as PieChartIcon, BarChart as BarChartIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from '@tanstack/react-router';
import { parse, isValid } from 'date-fns';

interface StaffData {
  reportSignedBy: string;
  count: number;
  studies: any[];
}

interface ModalityData {
  modality: string;
  count: number;
  percentage: number;
}

interface StaffModalityData {
  reportSignedBy: string;
  modalities: Record<string, number>;
  totalStudies: number;
}

// Define chart types
type StaffOverviewChartType = 'bar' | 'pie';
type StaffModalityChartType = 'bar' | 'pie';

export default function StaffProductivityPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [staffData, setStaffData] = useState<StaffData[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [timeRange, setTimeRange] = useState({ start: '00:00', end: '23:59' });
  const [selectedModalities, setSelectedModalities] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedRadiologists, setSelectedRadiologists] = useState<string[]>([]);
  const [availableModalities, setAvailableModalities] = useState<string[]>([]);
  const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
  const [availableRadiologists, setAvailableRadiologists] = useState<string[]>([]);
  const [totalStudies, setTotalStudies] = useState(0);
  const [workingDays, setWorkingDays] = useState(0);
  const [modalityData, setModalityData] = useState<ModalityData[]>([]); // Overall modality distribution
  const [staffModalityData, setStaffModalityData] = useState<StaffModalityData[]>([]); // Data for stacked bar chart
  const [aggregatedModalityData, setAggregatedModalityData] = useState<ModalityData[]>([]); // Data for pie chart
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [staffOverviewChartType, setStaffOverviewChartType] = useState<StaffOverviewChartType>('bar'); // State for overview chart type
  const [staffModalityChartType, setStaffModalityChartType] = useState<StaffModalityChartType>('bar'); // State for modality chart type

  const CHART_COLORS = [
    '#4f46e5', '#06b6d4', '#8b5cf6', '#ec4899', 
    '#f97316', '#84cc16', '#14b8a6', '#6366f1',
    '#a855f7', '#ec4899', '#f43f5e', '#f59e0b'
  ];

  useEffect(() => {
    const storedData = localStorage.getItem('radiology_data');
    if (!storedData) {
      navigate({ to: '/' });
      return;
    }

    try {
      const data = JSON.parse(storedData);
      setOriginalData(data);
      // Initial data processing
      const { modalities, statuses, radiologists } = getAvailableFilterOptions(data);
      setAvailableModalities(modalities);
      setAvailableStatuses(statuses);
      setAvailableRadiologists(radiologists);
      processData(data); 
    } catch (err) {
      console.error('Error processing stored data:', err);
      setError('Error processing data. Please try uploading the file again.');
    }
  }, [navigate]); // Only run once on mount

  const getAvailableFilterOptions = (rows: any[]) => {
    const modalities = new Set<string>();
    const statuses = new Set<string>();
    const radiologists = new Set<string>();

    rows.forEach(row => {
      modalities.add(row['Mod.'] || 'N/A');
      statuses.add(row['Status'] || 'N/A');
      radiologists.add(row['Report Signed By'] || 'Unassigned');
    });

    return {
      modalities: Array.from(modalities).sort(),
      statuses: Array.from(statuses).sort(),
      radiologists: Array.from(radiologists).sort(),
    };
  };


  const extractTimeFromString = (timeStr: string): { hour: number, minute: number } | null => {
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!timeMatch) return null;

    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    const period = timeMatch[3]?.toUpperCase();

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return { hour, minute };
  };

  const isTimeInRange = (timeStr: string, start: string, end: string): boolean => {
    const time = extractTimeFromString(timeStr);
    if (!time) return false;

    const [startHour, startMinute] = start.split(':').map(Number);
    const [endHour, endMinute] = end.split(':').map(Number);

    const timeValue = time.hour * 60 + time.minute;
    const startValue = startHour * 60 + startMinute;
    const endValue = endHour * 60 + endMinute;

    return timeValue >= startValue && timeValue <= endValue;
  };

  const processData = useCallback((rows: any[]) => {
    setLoading(true);
    setError(null); // Clear previous errors
    try {
      const staffMap = new Map<string, { count: number; studies: any[]; modalities: Record<string, number> }>();
      const dates = new Set<string>();
      const modalityCountMap = new Map<string, number>(); // For overall modality distribution
      const aggregatedModalityCountMap = new Map<string, number>(); // For staff modality pie chart

      // Keep track of all filter options from the original data
      const allModalities = new Set<string>();
      const allStatuses = new Set<string>();
      const allRadiologists = new Set<string>();
      rows.forEach(row => {
         allModalities.add(row['Mod.'] || 'N/A');
         allStatuses.add(row['Status'] || 'N/A');
         allRadiologists.add(row['Report Signed By'] || 'Unassigned');
      });
      // Update available options only if they haven't been set yet or if needed
      if (availableModalities.length === 0) setAvailableModalities(Array.from(allModalities).sort());
      if (availableStatuses.length === 0) setAvailableStatuses(Array.from(allStatuses).sort());
      if (availableRadiologists.length === 0) setAvailableRadiologists(Array.from(allRadiologists).sort());


      const filteredRows = rows.filter(row => {
        const date = row.Date;
        const time = row.Time;
        const modality = row['Mod.'] || 'N/A';
        const status = row['Status'] || 'N/A';
        const reportSignedBy = row['Report Signed By'] || 'Unassigned';

        // Apply date range filter
        if (dateRange.start && dateRange.end && date) {
          try {
            const startDate = parse(dateRange.start, 'yyyy-MM-dd', new Date());
            const endDate = parse(dateRange.end, 'yyyy-MM-dd', new Date());
            const currentDate = parse(date, 'MM/dd/yyyy', new Date()); 

            if (isValid(startDate) && isValid(endDate) && isValid(currentDate)) {
              if (currentDate < startDate || currentDate > endDate) {
                return false;
              }
            }
          } catch (e) {
            console.error("Error parsing date:", e);
            return false; 
          }
        }

        // Apply time range filter
        if (!isTimeInRange(time, timeRange.start, timeRange.end)) {
          return false;
        }

        // Apply modality filter
        if (selectedModalities.length > 0 && !selectedModalities.includes(modality)) {
          return false;
        }

        // Apply status filter
        if (selectedStatuses.length > 0 && !selectedStatuses.includes(status)) {
          return false;
        }

        // Apply radiologist filter
        if (selectedRadiologists.length > 0 && !selectedRadiologists.includes(reportSignedBy)) {
          return false;
        }

        return true;
      });

      // Process the filtered rows
      filteredRows.forEach(row => {
        const modality = row['Mod.'] || 'N/A';
        const reportSignedBy = row['Report Signed By'] || 'Unassigned';

        if (row.Date) dates.add(row.Date);

        // Update overall modality counts
        modalityCountMap.set(modality, (modalityCountMap.get(modality) || 0) + 1);
        // Update aggregated modality counts for the pie chart
        aggregatedModalityCountMap.set(modality, (aggregatedModalityCountMap.get(modality) || 0) + 1);


        if (!staffMap.has(reportSignedBy)) {
          staffMap.set(reportSignedBy, { 
            count: 0, 
            studies: [],
            modalities: {}
          });
        }
        const staffEntry = staffMap.get(reportSignedBy)!;
        staffEntry.count++;
        staffEntry.studies.push(row);
        staffEntry.modalities[modality] = (staffEntry.modalities[modality] || 0) + 1;
      });

      const totalStudiesCount = filteredRows.length;

      // Process overall modality data
      const processedModalityData: ModalityData[] = Array.from(modalityCountMap.entries())
        .map(([modality, count]) => ({
          modality,
          count,
          percentage: totalStudiesCount > 0 ? (count / totalStudiesCount) * 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      // Process aggregated modality data for Pie chart
      const processedAggregatedModalityData: ModalityData[] = Array.from(aggregatedModalityCountMap.entries())
        .map(([modality, count]) => ({
          modality,
          count,
          percentage: totalStudiesCount > 0 ? (count / totalStudiesCount) * 100 : 0
        }))
        .filter(data => data.count > 0) // Filter out zero counts for Pie chart
        .sort((a, b) => b.count - a.count);

      // Process staff modality data for Bar chart
      const processedStaffModalityData: StaffModalityData[] = Array.from(staffMap.entries())
        .map(([name, data]) => ({
          reportSignedBy: name,
          modalities: data.modalities,
          totalStudies: data.count
        }))
        .sort((a, b) => b.totalStudies - a.totalStudies);

      const processedStaffData = Array.from(staffMap.entries())
        .map(([name, data]) => ({
          reportSignedBy: name,
          count: data.count,
          studies: data.studies
        }))
        .filter(data => data.count > 0) // Filter out staff with zero studies for Pie chart
        .sort((a, b) => b.count - a.count);

      setStaffData(processedStaffData);
      setModalityData(processedModalityData); // Overall distribution
      setStaffModalityData(processedStaffModalityData); // For stacked bar
      setAggregatedModalityData(processedAggregatedModalityData); // For pie chart
      setTotalStudies(totalStudiesCount);
      setWorkingDays(dates.size);

    } catch (err) {
      console.error('Error processing data:', err);
      setError('Error processing data. Please check the file format and try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, timeRange, selectedModalities, selectedStatuses, selectedRadiologists]);

  // Generic handler for checkbox changes
  const handleCheckboxChange = (
    e: React.ChangeEvent<HTMLInputElement>, 
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const { value, checked } = e.target;
    setter(prev => {
      const newSelection = checked
        ? [...prev, value]
        : prev.filter(item => item !== value);
      return newSelection;
    });
  };


  useEffect(() => {
    // Reprocess data whenever filters change
    if (originalData.length > 0) {
      processData(originalData);
    }
  }, [originalData, processData, selectedModalities, selectedStatuses, selectedRadiologists, dateRange, timeRange]);

  const clearFilters = () => {
    setDateRange({ start: '', end: '' });
    setTimeRange({ start: '00:00', end: '23:59' });
    setSelectedModalities([]);
    setSelectedStatuses([]);
    setSelectedRadiologists([]);
    // processData will be called by the useEffect hook due to state changes
  };

  // Determine which modalities have data in the current filtered staffModalityData
  const modalitiesWithData = availableModalities.filter(modality => 
    staffModalityData.some(staff => (staff.modalities[modality] || 0) > 0)
  );

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Staff Productivity</h1>
        </div>
        <button
          onClick={clearFilters}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg flex items-center gap-2 hover:bg-gray-200 transition-colors"
        >
          <Filter className="w-4 h-4" />
          Clear Filters
        </button>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-700">Processing data...</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Activity className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold">Total Studies</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{totalStudies}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Calendar className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold">Working Days</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{workingDays}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <PieChartIcon className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold">Modalities</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{availableModalities.length}</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-6 w-6 text-blue-600" />
            <h2 className="text-lg font-semibold">Staff</h2>
          </div>
          <p className="text-3xl font-bold text-gray-900">{availableRadiologists.length}</p>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        <div className="lg:col-span-4">
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            <h3 className="text-lg font-semibold mb-4">Filters</h3>

            <div className="space-y-4">
              <div className="flex flex-col gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  Date Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, start: e.target.value }));
                    }}
                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-sm"
                  />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => {
                      setDateRange(prev => ({ ...prev, end: e.target.value }));
                    }}
                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="block text-sm font-medium text-gray-700">
                  Time Range
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={timeRange.start}
                    onChange={(e) => {
                      setTimeRange(prev => ({ ...prev, start: e.target.value }));
                    }}
                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-sm"
                  />
                  <input
                    type="time"
                    value={timeRange.end}
                    onChange={(e) => {
                      setTimeRange(prev => ({ ...prev, end: e.target.value }));
                    }}
                    className="rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Modalities
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                  {availableModalities.map(modality => (
                    <label key={modality} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        value={modality}
                        checked={selectedModalities.includes(modality)}
                        onChange={(e) => handleCheckboxChange(e, setSelectedModalities)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm">{modality}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Statuses
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                  {availableStatuses.map(status => (
                    <label key={status} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        value={status}
                        checked={selectedStatuses.includes(status)}
                        onChange={(e) => handleCheckboxChange(e, setSelectedStatuses)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Radiologists
                </label>
                <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-200 rounded-md p-2">
                  {availableRadiologists.map(radiologist => (
                    <label key={radiologist} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        value={radiologist}
                        checked={selectedRadiologists.includes(radiologist)}
                        onChange={(e) => handleCheckboxChange(e, setSelectedRadiologists)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm">{radiologist}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {/* Staff Productivity Overview Section with Tabs */}
          <div className="bg-white rounded-lg shadow-md p-6">
             <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <BarChartIcon className="h-5 w-5 text-blue-600" />
                  Staff Productivity Overview
                </h2>
                 {/* Tab Buttons */}
                <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setStaffOverviewChartType('bar')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      staffOverviewChartType === 'bar' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Bar
                  </button>
                  <button
                    onClick={() => setStaffOverviewChartType('pie')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      staffOverviewChartType === 'pie' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    Pie
                  </button>
                </div>
             </div>
            <div className="h-[400px]">
              {staffOverviewChartType === 'bar' && (
                <>
                  {staffData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={staffData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="reportSignedBy"
                          angle={-45}
                          textAnchor="end"
                          height={100}
                          interval={0}
                        />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#4f46e5" name="Studies">
                          {staffData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      No data available for the selected filters.
                    </div>
                  )}
                </>
              )}
               {staffOverviewChartType === 'pie' && (
                 <>
                  {staffData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={staffData} // Use staffData directly
                          dataKey="count"
                          nameKey="reportSignedBy"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          label={({ reportSignedBy, count }) => 
                            `${reportSignedBy}: ${count}` // Show count in label
                          }
                        >
                          {staffData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} studies`, name]}/>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      No data available for the selected filters.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Staff Modality Distribution Section with Tabs */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <BarChartIcon className="h-5 w-5 text-blue-600" />
                Staff Modality Distribution
              </h2>
              {/* Tab Buttons */}
              <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setStaffModalityChartType('bar')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    staffModalityChartType === 'bar' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Bar
                </button>
                <button
                  onClick={() => setStaffModalityChartType('pie')}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    staffModalityChartType === 'pie' ? 'bg-white text-blue-600 shadow' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Pie
                </button>
              </div>
            </div>
            <div className="h-[400px]">
              {staffModalityChartType === 'bar' && (
                <>
                  {staffModalityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={staffModalityData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="reportSignedBy" style={{ fontSize: '12px' }} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {modalitiesWithData.map((modality, index) => (
                          <Bar
                            key={modality}
                            dataKey={entry => entry.modalities[modality] || 0}
                            name={modality}
                            stackId="a"
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      No data available for the selected filters.
                    </div>
                  )}
                </>
              )}
              {staffModalityChartType === 'pie' && (
                 <>
                  {aggregatedModalityData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={aggregatedModalityData}
                          dataKey="count"
                          nameKey="modality"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          label={({ modality, percentage }) => 
                            `${modality}: ${percentage.toFixed(1)}%`
                          }
                        >
                          {aggregatedModalityData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={CHART_COLORS[index % CHART_COLORS.length]} 
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value, name) => [`${value} studies`, name]}/>
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-gray-500">
                      No data available for the selected filters.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
