import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RepositorySearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: string;
  onSortChange: (sort: string) => void;
  filterBy: string;
  onFilterChange: (filter: string) => void;
}

export const RepositorySearch = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  filterBy,
  onFilterChange,
}: RepositorySearchProps) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full">
        <Search className="absolute left-3 md:left-3 top-1/2 -translate-y-1/2 h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-11 md:pl-10 w-full h-12 md:h-10 text-base md:text-sm"
        />
      </div>
      <div className="flex gap-3 md:gap-2 w-full">
        <Select value={filterBy} onValueChange={onFilterChange}>
          <SelectTrigger className="flex-1 md:w-[140px] h-12 md:h-10 text-base md:text-sm touch-manipulation">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="all" className="text-base md:text-sm py-3 md:py-2">All</SelectItem>
            <SelectItem value="public" className="text-base md:text-sm py-3 md:py-2">Public</SelectItem>
            <SelectItem value="private" className="text-base md:text-sm py-3 md:py-2">Private</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="flex-1 md:w-[140px] h-12 md:h-10 text-base md:text-sm touch-manipulation">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <SelectItem value="updated" className="text-base md:text-sm py-3 md:py-2">Last updated</SelectItem>
            <SelectItem value="name" className="text-base md:text-sm py-3 md:py-2">Name</SelectItem>
            <SelectItem value="stars" className="text-base md:text-sm py-3 md:py-2">Stars</SelectItem>
            <SelectItem value="size" className="text-base md:text-sm py-3 md:py-2">Size</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
