import React, { ComponentProps, useCallback, useState } from "react";
import TextInput from "ink-text-input";
import yn from "npm:yn";

interface ConfirmInputProps extends
  Omit<
    ComponentProps<typeof TextInput>,
    "value" | "onChange" | "onSubmit"
  > {
  isChecked?: boolean;
  onChange?: (value: string) => void;
  onSubmit?: (value: boolean) => void;
  placeholder?: string;
}

const ConfirmInput = ({
  isChecked = false,
  onChange,
  onSubmit,
  placeholder = "",
  ...props
}: ConfirmInputProps) => {
  const [value, setValue] = useState("");
  const handleSubmit = useCallback(
    (newValue: string) => {
      onSubmit?.(yn(newValue, { default: isChecked }));
    },
    [isChecked, onSubmit],
  );

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  return (
    <TextInput
      {...props}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
};

export default ConfirmInput;
