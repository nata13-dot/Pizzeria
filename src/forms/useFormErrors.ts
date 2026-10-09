import {useRef, useState, type RefObject} from 'react';
import type {TextInput} from 'react-native';
import {validationFields, type FieldErrors} from './validation';

export function useFormErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const inputs = useRef<Record<string, TextInput | null>>({});
  function validate(next: FieldErrors): boolean {
    const present = Object.fromEntries(Object.entries(next).filter(([,message])=>Boolean(message)));
    setErrors(present);
    const first = Object.keys(present).find(key=>inputs.current[key]);
    if(first)inputs.current[first]?.focus();
    return Object.keys(present).length === 0;
  }
  return {errors, validate, clear:()=>setErrors({}), field:(key:string,forwarded?:RefObject<TextInput|null>)=>({error:errors[key], inputRef:(input:TextInput|null)=>{inputs.current[key]=input;if(forwarded)forwarded.current=input;}}), fromError:(error:unknown,labels:Record<string,string>,aliases:Record<string,string>={})=>validate(Object.fromEntries(Object.entries(validationFields(error,labels)).map(([key,value])=>[aliases[key]??key,value])))};
}
