/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
		extend: {
			colors: {
				gray: {
					bg: '#F5F7F7',
					3: '#E4EAEB',
					6: '#8E989C',
					7: '#5C686D',
					8: '#273339'
				}, 
				blue: {
					0: '#F0F4FF',
					1: '#D2E0FF',
					2: '#B3CEFF',
					3: '#8097F2',
					4: '#3770FF',
					'4B': '#2368FB',
				}
			},
			fontFamily: {
				nunito: ['Nunito Sans', 'sans-serif'],
				montserrat: ['Montserrat']
			},
			boxShadow: {
				'blue-1': '0px 1px 4px rgba(3, 0, 92, 0.1)',
				'inner-1': 'inset 0px 3px 8px rgba(179, 206, 255, 0.35)'
			},
			screens: {
				'md-max':{'max': '767px'},
			}
		},
	},
  plugins: [],
}

