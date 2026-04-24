'use client';

import React from 'react';
import Select, { Props as SelectProps } from 'react-select';

export interface MultiSelectProps extends SelectProps {
  label?: string;
}

export function MultiSelect({ label, ...props }: MultiSelectProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>}
      <Select
        isMulti
        unstyled
        classNames={{
          control: ({ isFocused }) =>
            `flex w-full rounded-md border bg-white text-sm hover:cursor-pointer transition-colors ${
              isFocused ? 'border-slate-800 ring-1 ring-slate-800' : 'border-gray-200'
            }`,
          menu: () => 'mt-1 rounded-md bg-white border border-gray-200 shadow-xl overflow-hidden z-50 text-sm',
          menuList: () => 'p-1',
          option: ({ isFocused, isSelected }) =>
            `px-3 py-2 rounded-sm cursor-pointer transition-colors ${
              isSelected 
                ? 'bg-slate-800 text-white' 
                : isFocused 
                  ? 'bg-gray-100 text-gray-900' 
                  : 'text-gray-700'
            }`,
          multiValue: () => 'bg-gray-100 border border-gray-200 rounded-md m-0.5 flex items-center shadow-sm',
          multiValueLabel: () => 'text-xs px-2 py-0.5 text-gray-800 font-medium',
          multiValueRemove: () => 'hover:bg-red-50 hover:text-red-600 text-gray-400 rounded-r-md px-1 cursor-pointer transition-colors',
          placeholder: () => 'text-gray-400 text-sm px-2',
          input: () => 'text-sm text-gray-900 px-1 py-0.5',
          valueContainer: () => 'p-1 gap-1',
          clearIndicator: () => 'text-gray-400 hover:text-gray-600 cursor-pointer p-1 transition-colors',
          dropdownIndicator: () => 'text-gray-400 hover:text-gray-600 cursor-pointer p-1 transition-colors',
          indicatorSeparator: () => 'bg-gray-200 my-1 mx-1',
        }}
        {...props}
      />
    </div>
  );
}
