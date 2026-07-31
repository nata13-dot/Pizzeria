import Echo from 'laravel-echo';
import Pusher from 'pusher-js/react-native';
import {API_URL} from './api';
export function ordersChannel(token:string,branchId:number,onChange:()=>void){
 (globalThis as any).Pusher=Pusher;
 const host=process.env.EXPO_PUBLIC_REVERB_HOST??'127.0.0.1',port=+(process.env.EXPO_PUBLIC_REVERB_PORT??8080);
 const echo=new Echo({broadcaster:'reverb',key:process.env.EXPO_PUBLIC_REVERB_KEY??'xabmaxpopewth0d7ljhf',wsHost:host,wsPort:port,wssPort:port,forceTLS:false,enabledTransports:['ws','wss'],authEndpoint:`${API_URL}/broadcasting/auth`,auth:{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'}}});
 echo.private(`branch.${branchId}.orders`).listen('OrderStatusChanged',onChange);
 return()=>{echo.leave(`branch.${branchId}.orders`);echo.disconnect()};
}
