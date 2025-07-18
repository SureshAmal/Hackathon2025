import React, { useState, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { Input } from "./components/ui/input.tsx";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  BarElement,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { Slider } from "./components/ui/slider";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  ChartLegend,
  BarElement
);

function calculateEMA(data: number[], span: number): number[] {
  const k = 2 / (span + 1);
  let emaArr: number[] = [];
  let ema = data[0];
  emaArr.push(ema);
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    emaArr.push(ema);
  }
  return emaArr;
}

function calculateDEMA(data: number[], span: number): number[] {
  const ema = calculateEMA(data, span);
  const emaOfEma = calculateEMA(ema, span);
  return ema.map((val, i) => 2 * val - emaOfEma[i]);
}

function backtestDEMA(data: any[], capital = 100000): { chartData: any[]; trades: any[]; summary: any } {
  const close = data.map((row) => Number(row.Close));
  const dema20 = calculateDEMA(close, 20);
  const dema30 = calculateDEMA(close, 30);
  let position = null;
  let trades: any[] = [];
  let buyPrice = 0;
  let shares = 0;
  let chartData: any[] = [];

  for (let i = 0; i < data.length; i++) {
    let signal = "Hold";
    if (
      i > 0 &&
      dema20[i] > dema30[i] &&
      dema20[i - 1] <= dema30[i - 1]
    ) {
      signal = "Buy";
      if (!position) {
        buyPrice = close[i];
        shares = Math.floor(capital / buyPrice);
        position = "Long";
        trades.push({
          Date: data[i].Date,
          Type: "Buy",
          Price: buyPrice,
          Shares: shares,
        });
      }
    } else if (
      i > 0 &&
      dema20[i] < dema30[i] &&
      dema20[i - 1] >= dema30[i - 1]
    ) {
      signal = "Sell";
      if (position === "Long") {
        const sellPrice = close[i];
        const profitPerShare = sellPrice - buyPrice;
        const totalProfit = profitPerShare * shares;
        trades.push({
          Date: data[i].Date,
          Type: "Sell",
          Price: sellPrice,
          Shares: shares,
          Profit_per_share: profitPerShare,
          Total_Profit: totalProfit,
        });
        position = null;
      }
    }
    chartData.push({
      ...data[i],
      DEMA20: dema20[i],
      DEMA30: dema30[i],
      Signal: signal,
    });
  }

  const sellTrades = trades.filter((t) => t.Type === "Sell");
  const totalProfit = sellTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0);
  const winTrades = sellTrades.filter((t) => (t.Total_Profit || 0) > 0);
  const lossTrades = sellTrades.filter((t) => (t.Total_Profit || 0) <= 0);
  const totalWin = winTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0);
  const totalLoss = Math.abs(lossTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0));
  const winRate = totalWin + totalLoss > 0 ? (totalWin / (totalWin + totalLoss)) * 100 : 0;

  return {
    chartData,
    trades,
    summary: {
      "Total Trades": sellTrades.length,
      "Total Profit": totalProfit,
      "Win Rate (%)": winRate.toFixed(2),
    },
  };
}

interface CompanyData {
  fileName: string;
  chartData: any[];
  trades: any[];
  summary: any;
}

// Helper to convert array of objects to CSV string
function toCSV(rows: any[]) {
  if (!rows.length) return '';
  const header = Object.keys(rows[0]).join(',');
  const body = rows.map(row => Object.values(row).join(',')).join('\n');
  return header + '\n' + body;
}

const CsvBacktest: React.FC = () => {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [activeCompany, setActiveCompany] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<string>("dema");
  const [investment, setInvestment] = useState<number>(100000);
  const [range, setRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  useEffect(() => {
    if (companies[activeCompany] && companies[activeCompany].chartData.length > 0) {
      setRange({ start: 0, end: companies[activeCompany].chartData.length - 1 });
    }
  }, [activeCompany, companies]);

  function getFilteredData(data: any[]) {
    if (!companies[activeCompany] || !data.length) return data;
    return data.slice(range.start, range.end + 1);
  }

  useEffect(() => {
    if (!companies.length) return;
    setCompanies((prev) =>
      prev.map((company) => {
        const data = company.chartData.map((row: any) => ({ ...row }));
        const { chartData, trades, summary } = backtestDEMA(
          data,
          investment
        );
        return { ...company, chartData, trades, summary };
      })
    );
  }, [investment]);

  function backtestDEMA(data: any[], capital = 100000): { chartData: any[]; trades: any[]; summary: any } {
    const close = data.map((row) => Number(row.Close));
    const dema20 = calculateDEMA(close, 20);
    const dema30 = calculateDEMA(close, 30);
    let position: 'Long' | null = null;
    let trades: any[] = [];
    let buyPrice = 0;
    let shares = 0;
    let chartData: any[] = [];

    for (let i = 0; i < data.length; i++) {
      let signal = "Hold";
      if (
        i > 0 &&
        dema20[i] > dema30[i] &&
        dema20[i - 1] <= dema30[i - 1]
      ) {
        signal = "Buy";
        if (position === null) {
          buyPrice = close[i];
          shares = Math.floor(capital / buyPrice);
          position = "Long";
          trades.push({
            Date: data[i].Date,
            Type: "Buy",
            Price: buyPrice,
            Shares: shares,
          });
        }
      } else if (
        i > 0 &&
        dema20[i] < dema30[i] &&
        dema20[i - 1] >= dema30[i - 1]
      ) {
        signal = "Sell";
        if (position === "Long") {
          const sellPrice = close[i];
          const profitPerShare = sellPrice - buyPrice;
          const totalProfit = profitPerShare * shares;
          trades.push({
            Date: data[i].Date,
            Type: "Sell",
            Price: sellPrice,
            Shares: shares,
            Profit_per_share: profitPerShare,
            Total_Profit: totalProfit,
          });
          position = null;
        }
      }
      chartData.push({
        ...data[i],
        DEMA20: dema20[i],
        DEMA30: dema30[i],
        Signal: signal,
      });
    }

    // Ensure trade log alternates Buy/Sell
    let filteredTrades: any[] = [];
    let lastType: 'Buy' | 'Sell' | null = null;
    for (const trade of trades) {
      if (trade.Type === lastType) continue;
      filteredTrades.push(trade);
      lastType = trade.Type;
    }

    const sellTrades = filteredTrades.filter((t) => t.Type === "Sell");
    const totalProfit = sellTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0);
    const winTrades = sellTrades.filter((t) => (t.Total_Profit || 0) > 0);
    const lossTrades = sellTrades.filter((t) => (t.Total_Profit || 0) <= 0);
    const totalWin = winTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0);
    const totalLoss = Math.abs(lossTrades.reduce((acc, t) => acc + (t.Total_Profit || 0), 0));
    const winRate = totalWin + totalLoss > 0 ? (totalWin / (totalWin + totalLoss)) * 100 : 0;

    return {
      chartData,
      trades: filteredTrades,
      summary: {
        "Total Trades": sellTrades.length,
        "Total Profit": totalProfit,
        "Win Rate (%)": winRate.toFixed(2),
      },
    };
  }

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const filesArr = Array.from(files);
    let loaded = 0;
    const newCompanies: CompanyData[] = [];
    filesArr.forEach((file, idx) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const data = (results.data as string[][]).map((row) => ({
            Date: row[0],
            Open: row[1],
            High: row[2],
            Low: row[3],
            Close: row[4],
            Volume: row[5],
          }));
          data.forEach((row) => {
            if (row.Date && row.Date.includes(" ")) {
              row.Date = row.Date.split(" ")[0];
            }
          });
          const { chartData, trades, summary } = backtestDEMA(data, investment);
          newCompanies[idx] = {
            fileName: file.name,
            chartData,
            trades,
            summary,
          };
          loaded++;
          if (loaded === filesArr.length) {
            setCompanies((prev) => [...prev, ...newCompanies]);
            setActiveCompany(companies.length); // set to first new file
          }
        },
      });
    });
  };

  const topCompanies = companies
    .map((c) => ({
      name: c.fileName.replace(/\.csv$/, ""),
      profit: c.summary["Total Profit"],
      trades: c.summary["Total Trades"],
    }))
    .sort((a, b) => b.profit - a.profit);

  const getDemaChartData = (company: CompanyData) => ({
    labels: company.chartData.map((d) => d.Date),
    datasets: [
      {
        label: "Close",
        data: company.chartData.map((d) => +d.Close),
        borderColor: "#8884d8",
        backgroundColor: "#8884d8",
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "DEMA 20",
        data: company.chartData.map((d) => +d.DEMA20),
        borderColor: "#82ca9d",
        backgroundColor: "#82ca9d",
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "DEMA 30",
        data: company.chartData.map((d) => +d.DEMA30),
        borderColor: "#ff7300",
        backgroundColor: "#ff7300",
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: "Buy",
        data: company.chartData.map((d) => (d.Signal === "Buy" ? +d.Close : null)),
        borderColor: "#00C49F",
        backgroundColor: "#00C49F",
        pointStyle: "triangle",
        pointRadius: 8,
        type: "line" as const,
        showLine: false,
      },
      {
        label: "Sell",
        data: company.chartData.map((d) => (d.Signal === "Sell" ? +d.Close : null)),
        borderColor: "#FF4C4C",
        backgroundColor: "#FF4C4C",
        pointStyle: "rectRot",
        pointRadius: 8,
        type: "line" as const,
        showLine: false,
      },
    ],
  });


  const topCompaniesBarData = {
    labels: topCompanies.map((c) => c.name),
    datasets: [
      {
        label: "Total Profit",
        data: topCompanies.map((c) => c.profit),
        backgroundColor: "#8884d8",
      },
    ],
  };

  const summaryRows = useMemo(() => {
    return companies.map((c) => ({
      Stock: c.fileName.replace(/\.csv$/, ""),
      "Total Trades": c.summary["Total Trades"],
      "Total Profit": c.summary["Total Profit"],
      "Win Rate (%)": c.summary["Win Rate (%)"],
    })).sort((a, b) => b["Total Profit"] - a["Total Profit"]);
  }, [companies]);


  return (
    <div className="flex h-screen w-screen bg-gray-100">
      <div className="w-1/3 min-w-[250px] h-full overflow-y-auto bg-white border-r shadow-md p-6 flex flex-col justify-start">
        <h2 className="text-2xl font-bold mb-6">📊 DEMA Backtest Visualizer</h2>
        <Input type="file" accept=".csv" onChange={handleFiles} className="mb-6" multiple />
        {companies.length > 0 && (
          <>
            <h3 className="font-semibold mb-4">Top Companies by Total Profit</h3>
            <Bar
              data={topCompaniesBarData}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false },
                  title: { display: true, text: "Top Companies by Total Profit" },
                },
                scales: {
                  x: { display: true, title: { display: true, text: "Company" } },
                  y: { display: true, title: { display: true, text: "Total Profit" } },
                },
              }}
            />
            <table className="min-w-full text-sm mt-6">
              <thead>
                <tr>
                  <th className="px-2 py-1 border-b">Company</th>
                  <th className="px-2 py-1 border-b">Total Profit</th>
                  <th className="px-2 py-1 border-b">Total Trades</th>
                </tr>
              </thead>
              <tbody>
                {topCompanies.map((c) => (
                  <tr key={c.name}>
                    <td className="px-2 py-1 border-b">{c.name}</td>
                    <td className="px-2 py-1 border-b">{c.profit.toFixed(2)}</td>
                    <td className="px-2 py-1 border-b">{c.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      <div className="flex-1 h-full overflow-y-auto bg-gray-50 p-8 flex flex-col">
        {companies.length > 0 && companies[activeCompany] && (
          <div className="flex flex-col gap-8">
            <div className="flex gap-2 border-b mb-4">
              {companies.map((c, idx) => (
                <button
                  key={c.fileName}
                  className={`px-3 py-1 border-b-2 ${activeCompany === idx ? "border-blue-500 font-bold" : "border-transparent"}`}
                  onClick={() => setActiveCompany(idx)}
                >
                  {c.fileName.replace(/\.csv$/, "")}
                </button>
              ))}
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="dema">DEMA Chart</TabsTrigger>
                <TabsTrigger value="trades">Trade Log</TabsTrigger>
              </TabsList>
              <TabsContent value="dema">
                <div className="mb-6">
                  <h3 className="font-semibold mb-2">Summary</h3>
                  <ul className="mb-4">
                    <li>Total Trades: {companies[activeCompany].summary["Total Trades"]}</li>
                    <li>Total Profit: {companies[activeCompany].summary["Total Profit"].toFixed(2)}</li>
                    <li>Win Rate: {companies[activeCompany].summary["Win Rate (%)"]}%</li>
                  </ul>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium">Investment:</label>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={investment}
                        onChange={e => setInvestment(Number(e.target.value))}
                        className="border rounded px-2 py-1 w-28"
                      />
                    </div>
                  </div>
                  <Line
                    data={getDemaChartData({ ...companies[activeCompany], chartData: getFilteredData(companies[activeCompany].chartData) })}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: { position: "top" as const },
                        title: { display: true, text: "DEMA Strategy Chart" },
                      },
                      interaction: { mode: "index", intersect: false },
                      scales: {
                        x: { display: true, title: { display: true, text: "Date" } },
                        y: { display: true, title: { display: true, text: "Price" } },
                      },
                    }}
                  />
                  {companies[activeCompany].chartData.length > 1 && (
                    <div className="flex flex-col items-center gap-2 my-6 w-full">
                      <div className="flex items-center gap-4 w-full">
                        <span className="text-xs">{companies[activeCompany].chartData[range.start]?.Date}</span>
                        <div className="flex-1 px-4">
                          <Slider
                            min={0}
                            max={companies[activeCompany].chartData.length - 1}
                            value={[range.start, range.end]}
                            step={1}
                            onValueChange={([start, end]) => setRange({ start, end })}
                          />
                        </div>
                        <span className="text-xs">{companies[activeCompany].chartData[range.end]?.Date}</span>
                      </div>
                      <div className="text-xs text-gray-500">Showing {range.end - range.start + 1} days</div>
                    </div>
                  )}
                  <hr className="my-6 border-t border-gray-300" />
                </div>
              </TabsContent>
              <TabsContent value="trades">
                <div className="mt-6">
                  <h3 className="font-semibold mb-2">Trade Log</h3>
                  <div className="overflow-x-auto">
                    {(() => {
                      const filteredChartData = getFilteredData(companies[activeCompany].chartData);
                      const minDate = filteredChartData[0]?.Date;
                      const maxDate = filteredChartData[filteredChartData.length - 1]?.Date;
                      let filteredTrades = companies[activeCompany].trades.filter(
                        (trade: any) => trade.Date >= minDate && trade.Date <= maxDate
                      );
                      if (filteredTrades.some((t: any) => t.Type === "Sell")) {
                        const allTrades = companies[activeCompany].trades;
                        const lastBuyIdx = allTrades
                          .map((t: any, idx: number) => ({ t, idx }))
                          .filter(({ t }) => t.Type === "Buy" && t.Date <= minDate)
                          .map(({ idx }) => idx)
                          .pop();
                        if (lastBuyIdx !== undefined) {
                          const lastBuy = allTrades[lastBuyIdx];
                          // Only add if not already in filteredTrades
                          if (!filteredTrades.find((t: any) => t.Type === "Buy" && t.Date === lastBuy.Date)) {
                            filteredTrades = [lastBuy, ...filteredTrades];
                          }
                        }
                      }
                      if (filteredTrades.length === 0) {
                        return <div className="text-center text-gray-500 py-8">No trades in this window</div>;
                      }
                      return (
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 border-b">Date</th>
                              <th className="px-2 py-1 border-b">Type</th>
                              <th className="px-2 py-1 border-b">Price</th>
                              <th className="px-2 py-1 border-b">Shares</th>
                              <th className="px-2 py-1 border-b">Profit/Share</th>
                              <th className="px-2 py-1 border-b">Total Profit</th>
                              <th className="px-2 py-1 border-b">Win/Loss</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTrades.map((trade: any, idx: number) => {
                              const profit = trade.Type === "Sell" && typeof trade.Total_Profit === "number" ? trade.Total_Profit : null;
                              const winLoss = trade.Type === "Sell" ? (trade.Total_Profit > 0 ? "Win" : (trade.Total_Profit < 0 ? "Loss" : "Break Even")) : "-";
                              return (
                                <tr key={idx}>
                                  <td className="px-2 py-1 border-b">{trade.Date}</td>
                                  <td className="px-2 py-1 border-b">{trade.Type}</td>
                                  <td className="px-2 py-1 border-b">{typeof trade.Price === "number" ? trade.Price.toFixed(2) : trade.Price}</td>
                                  <td className="px-2 py-1 border-b">{trade.Shares}</td>
                                  <td className="px-2 py-1 border-b">{trade.Type === "Sell" && typeof trade.Profit_per_share === "number" ? trade.Profit_per_share.toFixed(2) : "-"}</td>
                                  <td className={`px-2 py-1 border-b ${profit > 0 ? 'text-green-600 font-semibold' : profit < 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{trade.Type === "Sell" && typeof trade.Total_Profit === "number" ? trade.Total_Profit.toFixed(2) : "-"}</td>
                                  <td className={`px-2 py-1 border-b ${winLoss === 'Win' ? 'text-green-600 font-semibold' : winLoss === 'Loss' ? 'text-red-600 font-semibold' : winLoss === 'Break Even' ? 'text-gray-500' : ''}`}>{winLoss}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default CsvBacktest; 
