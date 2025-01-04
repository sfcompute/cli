import { useCallback } from "react";
import TextInput from "ink-text-input";
import yn from "npm:yn";
import React from "react";

const noop = () => {};

interface ConfirmInputProps {
  isChecked?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: boolean) => void;
  placeholder?: string;
  value?: string;
  [key: string]: any;
}

const ConfirmInput: React.FC<ConfirmInputProps> = ({
  isChecked = false,
  onChange = noop,
  onSubmit = noop,
  placeholder = "",
  value = "",
  ...props
}) => {
  const handleSubmit = useCallback(
    (newValue: string) => {
      onSubmit(yn(newValue, { default: isChecked }));
    },
    [isChecked, onSubmit]
  );

  return (
    <TextInput
      {...props}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onSubmit={handleSubmit}
    />
  );
};

export default ConfirmInput;
