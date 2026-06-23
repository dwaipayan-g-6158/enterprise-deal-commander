import { useState } from "react";
import { Link } from "wouter";
import { useListDeals, useCreateDeal, getListDealsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, Plus } from "lucide-react";

export default function Deals() {
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<any>("all");
  const [state, setState] = useState<any>("active");
  const queryClient = useQueryClient();

  const queryParams = {
    ...(health && health !== "all" ? { health } : {}),
    ...(state ? { state } : {}),
  };

  const { data, isLoading } = useListDeals(queryParams);

  const filteredDeals = data?.data?.filter(d => 
    d.dealName.toLowerCase().includes(search.toLowerCase()) ||
    d.accountName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Deal Roster</h1>
          <p className="text-muted-foreground mt-2">Active pipeline and technical validation states</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Deal
        </Button>
      </div>

      <div className="flex gap-4 items-center mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search deals or accounts..." 
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={health} onValueChange={setHealth}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Health States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="YELLOW">Yellow</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
        <Select value={state} onValueChange={setState}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="State" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="deleted">Deleted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Deal</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">TCV</TableHead>
              <TableHead>Health</TableHead>
              <TableHead>Lead</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">Loading deals...</TableCell>
              </TableRow>
            ) : filteredDeals?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No deals found.</TableCell>
              </TableRow>
            ) : (
              filteredDeals?.map((deal) => (
                <TableRow key={deal.id} className="cursor-pointer group relative">
                  <TableCell className="font-medium">
                    <Link href={`/deals/${deal.id}`} className="hover:underline flex items-center h-full">
                      {deal.dealName}
                    </Link>
                  </TableCell>
                  <TableCell>{deal.accountName}</TableCell>
                  <TableCell>{deal.salesStage}</TableCell>
                  <TableCell className="text-right font-mono">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: deal.dealCurrency, maximumFractionDigits: 0 }).format(deal.calculatedTCV)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={deal.healthStatus === 'RED' ? 'destructive' : deal.healthStatus === 'YELLOW' ? 'default' : 'secondary'} className={deal.healthStatus === 'YELLOW' ? 'bg-amber-500 hover:bg-amber-600 text-white' : deal.healthStatus === 'GREEN' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}>
                      {deal.healthStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{deal.technicalLead}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}